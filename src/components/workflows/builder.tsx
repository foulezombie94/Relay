"use client";
import { useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  History,
  Play,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import { useWorkspace } from "../providers/data-provider";
import { Modal } from "../ui";
import { ActionEditor, ConditionsEditor } from "./fields";
import { WorkflowHook } from "./connections";
import { BlockPreview } from "./block-preview";
import { WorkflowCanvas } from "./canvas";
import { BlockCatalog } from "./block-catalog";
import { duplicateAction, type AddTarget } from "./canvas-model";
import { actionLabel } from "@/lib/domain/workflows";
import { workflowDefinition } from "@/lib/domain/workflow-schema";
import { newWorkflowAction, workflowTriggers } from "@/lib/domain/workflow-templates";
import type { Workflow, WorkflowAction, WorkflowDefinition } from "@/lib/domain/types";
import styles from "./workflows.module.css";

export type WorkflowDraft = { name: string; description: string; definition: WorkflowDefinition };
function identify(actions: WorkflowAction[]): WorkflowAction[] {
  return actions.map((a) => ({
    ...a,
    id: a.id ?? crypto.randomUUID(),
    ...(a.type === "branch"
      ? { then: identify(a.then ?? []), otherwise: identify(a.otherwise ?? []) }
      : {}),
  }));
}
function update(
  actions: WorkflowAction[],
  id: string,
  transform: (a: WorkflowAction) => WorkflowAction | null,
): WorkflowAction[] {
  return actions.flatMap((a) =>
    a.id === id
      ? (transform(a) ?? [])
      : a.type === "branch"
        ? {
            ...a,
            then: update(a.then ?? [], id, transform),
            otherwise: update(a.otherwise ?? [], id, transform),
          }
        : a,
  );
}
function find(actions: WorkflowAction[], id: string): WorkflowAction | undefined {
  for (const a of actions) {
    if (a.id === id) return a;
    if (a.type === "branch") {
      const result = find([...(a.then ?? []), ...(a.otherwise ?? [])], id);
      if (result) return result;
    }
  }
}
function move(actions: WorkflowAction[], id: string, direction: number): WorkflowAction[] {
  const index = actions.findIndex((a) => a.id === id);
  if (index >= 0) {
    const next = [...actions],
      target = index + direction;
    if (target < 0 || target >= next.length) return actions;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return actions.map((a) =>
    a.type === "branch"
      ? {
          ...a,
          then: move(a.then ?? [], id, direction),
          otherwise: move(a.otherwise ?? [], id, direction),
        }
      : a,
  );
}
export function WorkflowBuilder({
  workflow,
  initial,
  onClose,
  onSave,
  onPublish,
  onRuns,
  onTest,
}: {
  workflow?: Workflow;
  initial?: WorkflowDraft;
  onClose: () => void;
  onSave: (draft: WorkflowDraft, row?: Workflow) => Promise<Workflow>;
  onPublish: (row: Workflow) => Promise<void>;
  onRuns?: (row: Workflow) => void;
  onTest?: (row: Workflow) => void;
}) {
  const { objects } = useWorkspace();
  const [current, setCurrent] = useState(workflow);
  const [history, setHistory] = useState(() => {
    const definition = initial?.definition ??
      workflow?.definition ?? {
        object_id: objects.find((o) => o.slug === "deals")?.id ?? objects[0]?.id,
        trigger: { type: "manual" },
        conditions: [],
        actions: [newWorkflowAction("task")],
      };
    return {
      past: [] as WorkflowDraft[],
      present: {
        name: initial?.name ?? workflow?.name ?? "Nouvelle automatisation",
        description: initial?.description ?? workflow?.description ?? "",
        definition: { ...definition, actions: identify(definition.actions) },
      },
      future: [] as WorkflowDraft[],
    };
  });
  const draft = history.present;
  const [selected, setSelected] = useState("trigger"),
    [catalog, setCatalog] = useState<AddTarget | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(!workflow),
    [review, setReview] = useState(false);
  const active = find(draft.definition.actions, selected);
  function change(next: WorkflowDraft) {
    setHistory((h) => ({ past: [...h.past, h.present].slice(-50), present: next, future: [] }));
    setDirty(true);
  }
  const define = (patch: Partial<WorkflowDefinition>) =>
    change({ ...draft, definition: { ...draft.definition, ...patch } });
  const edit = (id: string, transform: (a: WorkflowAction) => WorkflowAction | null) =>
    define({ actions: update(draft.definition.actions, id, transform) });
  async function persist(publish = false) {
    setError("");
    const parsed = workflowDefinition.safeParse(draft.definition);
    if (!draft.name.trim() || draft.name.trim().length > 300 || !parsed.success) {
      setError(
        !draft.name.trim()
          ? "Donnez un nom au workflow."
          : parsed.success
            ? "Le nom est trop long."
            : parsed.error.issues
                .slice(0, 4)
                .map((i) => i.message)
                .join(" "),
      );
      return;
    }
    setBusy(true);
    try {
      const row = await onSave(
        { ...draft, name: draft.name.trim(), definition: parsed.data },
        current,
      );
      setCurrent(row);
      setDirty(false);
      if (publish) {
        await onPublish(row);
        onClose();
      }
      return row;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
      setReview(false);
    }
  }
  const undo = () => {
    if (history.past.length) {
      setHistory((h) => ({
        past: h.past.slice(0, -1),
        present: h.past.at(-1)!,
        future: [h.present, ...h.future],
      }));
      setDirty(true);
    }
  };
  const redo = () => {
    if (history.future.length) {
      setHistory((h) => ({
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      }));
      setDirty(true);
    }
  };
  function copy(id: string) {
    const source = find(draft.definition.actions, id);
    if (!source) return;
    const duplicate = duplicateAction(source);
    const insert = (actions: WorkflowAction[]): WorkflowAction[] =>
      actions.flatMap((a) =>
        a.id === id
          ? [a, duplicate]
          : a.type === "branch"
            ? { ...a, then: insert(a.then ?? []), otherwise: insert(a.otherwise ?? []) }
            : a,
      );
    define({ actions: insert(draft.definition.actions) });
    setSelected(duplicate.id!);
  }
  function addBlock(type: WorkflowAction["type"]) {
    if (!catalog || busy) return;
    const action = newWorkflowAction(type);
    if (catalog.after) {
      const insert = (actions: WorkflowAction[]): WorkflowAction[] =>
        actions.flatMap((a) =>
          a.id === catalog.after
            ? [a, action]
            : a.type === "branch"
              ? { ...a, then: insert(a.then ?? []), otherwise: insert(a.otherwise ?? []) }
              : a,
        );
      define({ actions: insert(draft.definition.actions) });
    } else if (catalog.parent && catalog.side)
      edit(catalog.parent, (parent) => ({
        ...parent,
        [catalog.side!]: [...(parent[catalog.side!] ?? []), action],
      }));
    else define({ actions: [...draft.definition.actions, action] });
    setSelected(action.id!);
    setCatalog(null);
  }
  return (
    <Modal
      open
      wide
      className={styles.builder}
      title="Workflows"
      description="Construisez et configurez votre workflow sur le canvas."
      onClose={() => {
        if (
          !busy &&
          (!dirty || window.confirm("Fermer sans enregistrer les dernières modifications ?"))
        )
          onClose();
      }}
    >
      <fieldset disabled={busy} className={styles.editorFieldset}>
        <div className={styles.editorToolbar}>
          <div>
            <input
              className={styles.nameInput}
              aria-label="Nom du workflow"
              maxLength={300}
              value={draft.name}
              onChange={(e) => change({ ...draft, name: e.target.value })}
            />
            <span className={styles.draftLabel}>
              {dirty
                ? "Modifications à enregistrer"
                : `Brouillon enregistré · v${current?.version ?? 1}`}
              {current?.published_version ? ` · Version active v${current.published_version}` : ""}
            </span>
          </div>
          <div className={styles.tools}>
            <button
              className="icon-button"
              aria-label="Annuler la modification"
              disabled={!history.past.length || busy}
              onClick={undo}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Rétablir la modification"
              disabled={!history.future.length || busy}
              onClick={redo}
            >
              <Redo2 size={16} />
            </button>
            <button className="button" onClick={() => persist()}>
              <Save size={14} />
              Enregistrer
            </button>
            {onTest && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={async () => {
                  const row = await persist();
                  if (row) onTest(row);
                }}
              >
                <Play size={14} />
                Tester
              </button>
            )}
            <button className="button primary" onClick={() => setReview(true)}>
              <Zap size={14} />
              Publier
            </button>
          </div>
        </div>
        <div className={styles.editorTabs} role="group" aria-label="Vue du workflow">
          <button type="button" aria-pressed="true">
            Éditeur
          </button>
          <button
            type="button"
            disabled={!current || !onRuns || busy}
            onClick={() => {
              if (
                current &&
                (!dirty ||
                  window.confirm("Ouvrir les exécutions sans enregistrer les modifications ?"))
              )
                onRuns?.(current);
            }}
          >
            <History size={13} />
            Exécutions
          </button>
          <span>
            {current?.enabled && current.published_version ? "Workflow actif" : "Brouillon"}
          </span>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className={styles.editorGrid}>
          <WorkflowCanvas
            definition={draft.definition}
            objectName={objects.find((o) => o.id === draft.definition.object_id)?.name}
            selected={selected}
            disabled={busy}
            onSelect={(node) => {
              setSelected(node.selection);
              setCatalog(null);
            }}
            onAdd={(target) => {
              const parent = target.parent
                ? find(draft.definition.actions, target.parent)
                : undefined;
              const length =
                parent && target.side
                  ? (parent[target.side]?.length ?? 0)
                  : draft.definition.actions.length;
              if (length >= (parent ? 10 : 20)) {
                setError("Le nombre maximal de blocs est atteint pour ce parcours.");
                return;
              }
              setCatalog(target);
            }}
          />
          <aside className={styles.inspector}>
            {catalog ? (
              <BlockCatalog
                branch={!!catalog.parent}
                onSelect={addBlock}
                onClose={() => setCatalog(null)}
              />
            ) : (
              <>
                <div className={styles.inspectorHeading}>
                  {active && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Revenir aux paramètres du workflow"
                      onClick={() => setSelected("trigger")}
                    >
                      <ArrowLeft size={16} />
                    </button>
                  )}
                  <span>{active ? "CONFIGURATION DU BLOC" : "PARAMÈTRES DU WORKFLOW"}</span>
                  <h3>{active ? actionLabel(active) : draft.name}</h3>
                  {active && (
                    <div className={styles.tools}>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Monter ce bloc"
                        onClick={() =>
                          define({ actions: move(draft.definition.actions, active.id!, -1) })
                        }
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Descendre ce bloc"
                        onClick={() =>
                          define({ actions: move(draft.definition.actions, active.id!, 1) })
                        }
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Dupliquer ce bloc"
                        onClick={() => copy(active.id!)}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Supprimer ce bloc"
                        onClick={() => {
                          edit(active.id!, () => null);
                          setSelected("trigger");
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {active ? (
                  <>
                    <ActionEditor
                      action={active}
                      objectId={draft.definition.object_id}
                      onChange={(next) => edit(active.id!, () => next)}
                    />
                    <BlockPreview
                      key={active.id}
                      definition={draft.definition}
                      actionId={active.id!}
                    />
                  </>
                ) : (
                  <div className={styles.actionEditor}>
                    <label>
                      Description
                      <textarea
                        maxLength={1000}
                        rows={2}
                        value={draft.description}
                        onChange={(e) => change({ ...draft, description: e.target.value })}
                        placeholder="Pourquoi votre équipe utilise ce workflow"
                      />
                    </label>
                    <label>
                      Type de fiches
                      <select
                        value={draft.definition.object_id}
                        onChange={(e) => define({ object_id: e.target.value })}
                      >
                        {objects.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quand démarrer
                      <select
                        value={draft.definition.trigger?.type ?? "manual"}
                        onChange={(e) =>
                          define({
                            trigger: {
                              type: e.target.value as NonNullable<
                                WorkflowDefinition["trigger"]
                              >["type"],
                              ...(e.target.value === "schedule"
                                ? {
                                    frequency: "daily" as const,
                                    time: "09:00",
                                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                                    weekdays: [1],
                                  }
                                : {}),
                              ...(e.target.value === "date_reached" ? { field: "close_date" } : {}),
                            },
                          })
                        }
                      >
                        {Object.entries(workflowTriggers).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {draft.definition.trigger?.type === "schedule" && (
                      <>
                        <label>
                          Fréquence
                          <select
                            value={draft.definition.trigger.frequency ?? "daily"}
                            onChange={(e) =>
                              define({
                                trigger: {
                                  ...draft.definition.trigger!,
                                  frequency: e.target.value as "daily" | "weekly",
                                },
                              })
                            }
                          >
                            <option value="daily">Chaque jour</option>
                            <option value="weekly">Chaque semaine</option>
                          </select>
                        </label>
                        <label>
                          Heure locale
                          <input
                            type="time"
                            value={draft.definition.trigger.time ?? "09:00"}
                            onChange={(e) =>
                              define({
                                trigger: { ...draft.definition.trigger!, time: e.target.value },
                              })
                            }
                          />
                        </label>
                        <label>
                          Fuseau horaire
                          <input
                            maxLength={100}
                            value={draft.definition.trigger.timezone ?? "Europe/Paris"}
                            onChange={(e) =>
                              define({
                                trigger: { ...draft.definition.trigger!, timezone: e.target.value },
                              })
                            }
                            placeholder="Europe/Paris, America/New_York…"
                          />
                        </label>
                        {draft.definition.trigger.frequency === "weekly" && (
                          <div className={styles.presets}>
                            {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((day, i) => (
                              <button
                                type="button"
                                className="button small"
                                aria-pressed={
                                  draft.definition.trigger?.weekdays?.includes(i) ?? false
                                }
                                key={day}
                                onClick={() => {
                                  const days = draft.definition.trigger?.weekdays ?? [];
                                  define({
                                    trigger: {
                                      ...draft.definition.trigger!,
                                      weekdays: days.includes(i)
                                        ? days.filter((d) => d !== i)
                                        : [...days, i],
                                    },
                                  });
                                }}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                        )}
                        <p className="caption">
                          Chaque occurrence traite les fiches correspondant aux critères, avec
                          déduplication par jour et par version publiée.
                        </p>
                      </>
                    )}
                    {draft.definition.trigger?.type === "date_reached" && (
                      <label>
                        Date surveillée
                        <input
                          required
                          value={draft.definition.trigger.field ?? "close_date"}
                          onChange={(e) =>
                            define({
                              trigger: { ...draft.definition.trigger!, field: e.target.value },
                            })
                          }
                          placeholder="close_date ou attributes.renouvellement"
                        />
                      </label>
                    )}
                    {["email_received", "email_replied"].includes(
                      draft.definition.trigger?.type ?? "",
                    ) && (
                      <p className={styles.help}>
                        Nouveaux emails synchronisés après publication, provenant de l’adresse email
                        de la fiche. L’événement et les résultats privés ne sont visibles que par le
                        propriétaire du compte. Une note créée par ce workflow peut partager le
                        contenu : configurez-la explicitement.
                      </p>
                    )}
                    {["webhook", "form_received"].includes(
                      draft.definition.trigger?.type ?? "",
                    ) && <WorkflowHook key={current?.id ?? "new"} id={current?.id} />}
                    {draft.definition.trigger?.type === "record_updated" && (
                      <label>
                        Information surveillée
                        <select
                          value={draft.definition.trigger.field ?? ""}
                          onChange={(e) =>
                            define({
                              trigger: {
                                type: "record_updated",
                                ...(e.target.value ? { field: e.target.value } : {}),
                              },
                            })
                          }
                        >
                          <option value="">Toute information</option>
                          {Object.entries({
                            stage: "Étape",
                            amount: "Montant",
                            owner_id: "Responsable",
                            close_date: "Clôture prévue",
                            email: "Email",
                            probability: "Probabilité",
                          }).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <h4>Critères d’entrée</h4>
                    <ConditionsEditor
                      value={draft.definition.conditions}
                      mode={draft.definition.condition_mode}
                      objectId={draft.definition.object_id}
                      onChange={(conditions) => define({ conditions })}
                      onMode={(condition_mode) => define({ condition_mode })}
                    />
                    <label>
                      Nouvelle entrée automatique
                      <select
                        value={draft.definition.reenrollment ?? "once"}
                        onChange={(e) =>
                          define({ reenrollment: e.target.value as "once" | "on_change" })
                        }
                      >
                        <option value="once">Une fois par fiche</option>
                        <option value="on_change">À chaque nouvel événement correspondant</option>
                      </select>
                    </label>
                    <p className={styles.help}>
                      La publication concerne les événements futurs. Pour traiter les fiches
                      existantes, utilisez un aperçu puis confirmez le lancement. Les modifications
                      faites par les workflows ne relancent pas d’autres workflows.
                    </p>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      </fieldset>
      {review && (
        <Modal
          open
          title="Publier cette automatisation"
          description="Vérifiez ce qui sera exécuté pour votre équipe."
          onClose={() => {
            if (!busy) setReview(false);
          }}
        >
          <p>
            <strong>{draft.name}</strong>
          </p>
          <p>
            {workflowTriggers[draft.definition.trigger?.type ?? "manual"]} ·{" "}
            {objects.find((o) => o.id === draft.definition.object_id)?.name}
          </p>
          <p>
            {draft.definition.conditions.length} critère(s) d’entrée ·{" "}
            {draft.definition.actions.length} bloc(s).
          </p>
          <p>
            {draft.definition.trigger?.type && draft.definition.trigger.type !== "manual"
              ? "Les prochaines fiches correspondant au déclencheur entreront automatiquement. Les fiches existantes ne sont pas inscrites en masse."
              : "Ce workflow sera disponible pour les lancements manuels après aperçu."}
          </p>
          <p>
            Les exécutions en cours garderont leur version d’origine. Chaque tâche ou engagement
            sera attribué au responsable configuré.
          </p>
          {error && <div className="alert error">{error}</div>}
          <div className="dialog-footer">
            <button className="button" disabled={busy} onClick={() => setReview(false)}>
              Revenir au workflow
            </button>
            <button className="button primary" disabled={busy} onClick={() => persist(true)}>
              {busy ? "Publication…" : "Enregistrer et publier"}
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
