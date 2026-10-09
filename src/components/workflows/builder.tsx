"use client";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCheck,
  Clock3,
  Copy,
  FileText,
  GitBranch,
  ListPlus,
  Plus,
  Redo2,
  Save,
  Settings2,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import { useWorkspace } from "../providers/data-provider";
import { Modal } from "../ui";
import { ActionEditor, ConditionsEditor } from "./fields";
import { WorkflowHook } from "./connections";
import { BlockPreview } from "./block-preview";
import { actionLabel } from "@/lib/domain/workflows";
import { workflowDefinition } from "@/lib/domain/workflow-schema";
import {
  newWorkflowAction,
  workflowActionTypes,
  workflowTriggers,
} from "@/lib/domain/workflow-templates";
import type { Workflow, WorkflowAction, WorkflowDefinition } from "@/lib/domain/types";
import styles from "./workflows.module.css";

export type WorkflowDraft = { name: string; description: string; definition: WorkflowDefinition };
export const actionIcons = {
  task: CheckCheck,
  commitment: CheckCheck,
  set_field: Settings2,
  note: FileText,
  add_to_list: ListPlus,
  delay: Clock3,
  branch: GitBranch,
  email: FileText,
  calendar: Clock3,
  slack: Zap,
  webhook: Zap,
  ai: Zap,
  wait_until: Clock3,
  notify: CheckCheck,
};
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
}: {
  workflow?: Workflow;
  initial?: WorkflowDraft;
  onClose: () => void;
  onSave: (draft: WorkflowDraft, row?: Workflow) => Promise<Workflow>;
  onPublish: (row: Workflow) => Promise<void>;
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
    [catalog, setCatalog] = useState<{ parent?: string; side?: "then" | "otherwise" } | null>(null);
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
  return (
    <Modal
      open
      wide
      className={styles.builder}
      title="Construire une automatisation"
      description="Choisissez ce qui déclenche le processus, puis les actions à effectuer."
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
            <button className="button primary" onClick={() => setReview(true)}>
              <Zap size={14} />
              Publier
            </button>
          </div>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className={styles.editorGrid}>
          <div className={styles.canvas} aria-label="Étapes du workflow">
            <div className={styles.canvasCaption}>Du déclenchement à la prochaine action</div>
            <button
              className={styles.triggerNode}
              data-selected={selected === "trigger"}
              onClick={() => setSelected("trigger")}
            >
              <span className={styles.nodeIcon}>
                <Zap size={19} />
              </span>
              <span>
                <small>DÉCLENCHEUR</small>
                <strong>{workflowTriggers[draft.definition.trigger?.type ?? "manual"]}</strong>
                <em>
                  {objects.find((o) => o.id === draft.definition.object_id)?.name ??
                    "Choisir les fiches"}
                </em>
              </span>
            </button>
            <div className={styles.connector} />
            <button
              className={styles.criteriaNode}
              data-selected={selected === "trigger"}
              onClick={() => setSelected("trigger")}
            >
              <Settings2 size={15} />
              <span>
                {draft.definition.conditions.length
                  ? `${draft.definition.conditions.length} condition(s) · ${draft.definition.condition_mode === "any" ? "OU" : "ET"}`
                  : "Toutes les fiches de ce type"}
              </span>
            </button>
            <div className={styles.connector} />
            {draft.definition.actions.map((a) => (
              <div className={styles.flowStep} key={a.id}>
                <Node
                  action={a}
                  selected={selected}
                  onSelect={setSelected}
                  onMove={(id, direction) =>
                    define({ actions: move(draft.definition.actions, id, direction) })
                  }
                  onDelete={(id) => edit(id, () => null)}
                  onCopy={(id) => {
                    const copy = find(draft.definition.actions, id);
                    if (!copy) return;
                    const duplicate = identify([
                      {
                        ...copy,
                        id: undefined,
                        ...(copy.type === "branch"
                          ? {
                              then: copy.then?.map((x) => ({ ...x, id: undefined })),
                              otherwise: copy.otherwise?.map((x) => ({ ...x, id: undefined })),
                            }
                          : {}),
                      },
                    ])[0];
                    const insert = (actions: WorkflowAction[]): WorkflowAction[] =>
                      actions.flatMap((item) =>
                        item.id === id
                          ? [item, duplicate]
                          : item.type === "branch"
                            ? {
                                ...item,
                                then: insert(item.then ?? []),
                                otherwise: insert(item.otherwise ?? []),
                              }
                            : item,
                      );
                    define({ actions: insert(draft.definition.actions) });
                    setSelected(duplicate.id!);
                  }}
                />
                {a.type === "branch" && (
                  <div className={styles.branches}>
                    {(["then", "otherwise"] as const).map((side) => (
                      <div key={side} className={styles.branch} data-side={side}>
                        <span className={styles.branchLabel}>
                          {side === "then" ? "Oui · critères remplis" : "Non · autre cas"}
                        </span>
                        {(a[side] ?? []).map((child) => (
                          <Node
                            key={child.id}
                            action={child}
                            selected={selected}
                            onSelect={setSelected}
                            onMove={(id, direction) =>
                              define({ actions: move(draft.definition.actions, id, direction) })
                            }
                            onDelete={(id) => edit(id, () => null)}
                          />
                        ))}
                        <button
                          className={styles.addNode}
                          disabled={(a[side]?.length ?? 0) >= 10}
                          onClick={() => setCatalog({ parent: a.id, side })}
                        >
                          <Plus size={14} />
                          Ajouter une action
                        </button>
                        {!a[side]?.length && <small>Continuer sans action</small>}
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.connector} />
              </div>
            ))}
            <button
              className={styles.addNode}
              disabled={draft.definition.actions.length >= 20}
              onClick={() => setCatalog({})}
            >
              <Plus size={16} />
              Ajouter un bloc
            </button>
            <div className={styles.connector} />
            <div className={styles.endNode}>Fin du processus</div>
          </div>
          <aside className={styles.inspector}>
            <div className={styles.inspectorHeading}>
              <span>{active ? "CONFIGURER LE BLOC" : "CONFIGURER LE PROCESSUS"}</span>
              <h3>{active ? actionLabel(active) : "Déclenchement et critères"}</h3>
            </div>
            {active ? (
              <>
                <ActionEditor
                  action={active}
                  objectId={draft.definition.object_id}
                  onChange={(next) => edit(active.id!, () => next)}
                />
                <BlockPreview key={active.id} definition={draft.definition} actionId={active.id!} />
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
                            aria-pressed={draft.definition.trigger?.weekdays?.includes(i) ?? false}
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
                        define({ trigger: { ...draft.definition.trigger!, field: e.target.value } })
                      }
                      placeholder="close_date ou attributes.renouvellement"
                    />
                  </label>
                )}
                {["email_received", "email_replied"].includes(
                  draft.definition.trigger?.type ?? "",
                ) && (
                  <p className={styles.help}>
                    Nouveaux emails synchronisés après publication, provenant de l’adresse email de
                    la fiche. L’événement et les résultats privés ne sont visibles que par le
                    propriétaire du compte. Une note créée par ce workflow peut partager le contenu
                    : configurez-la explicitement.
                  </p>
                )}
                {["webhook", "form_received"].includes(draft.definition.trigger?.type ?? "") && (
                  <WorkflowHook key={current?.id ?? "new"} id={current?.id} />
                )}
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
                  La publication concerne les événements futurs. Pour traiter les fiches existantes,
                  utilisez un aperçu puis confirmez le lancement. Les modifications faites par les
                  workflows ne relancent pas d’autres workflows.
                </p>
              </div>
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
      {catalog && (
        <Modal
          open
          title="Ajouter un bloc"
          description="Choisissez la prochaine étape du processus."
          onClose={() => setCatalog(null)}
        >
          <div className={styles.catalog}>
            {Object.entries(workflowActionTypes)
              .filter(([type]) => !catalog.parent || type !== "branch")
              .map(([type, label]) => {
                const Icon = actionIcons[type as keyof typeof workflowActionTypes];
                return (
                  <button
                    key={type}
                    className={styles.catalogItem}
                    onClick={() => {
                      const a = newWorkflowAction(type as keyof typeof workflowActionTypes);
                      if (catalog.parent && catalog.side)
                        edit(catalog.parent, (parent) => ({
                          ...parent,
                          [catalog.side!]: [...(parent[catalog.side!] ?? []), a],
                        }));
                      else define({ actions: [...draft.definition.actions, a] });
                      setSelected(a.id!);
                      setCatalog(null);
                    }}
                  >
                    <Icon size={20} />
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {type === "commitment"
                          ? "Une proposition à valider par l’équipe"
                          : type === "delay"
                            ? "Reprendre plus tard sans bloquer le serveur"
                            : type === "branch"
                              ? "Adapter les actions aux données de la fiche"
                              : "Appliquer une action sur la fiche concernée"}
                      </small>
                    </span>
                    <Plus size={15} />
                  </button>
                );
              })}
          </div>
        </Modal>
      )}
    </Modal>
  );
}
function Node({
  action: a,
  selected,
  onSelect,
  onMove,
  onDelete,
  onCopy,
}: {
  action: WorkflowAction;
  selected: string;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: number) => void;
  onDelete: (id: string) => void;
  onCopy?: (id: string) => void;
}) {
  const Icon = actionIcons[a.type];
  return (
    <div className={styles.node} data-selected={selected === a.id} data-type={a.type}>
      <button className={styles.nodeMain} onClick={() => onSelect(a.id!)}>
        <span className={styles.nodeIcon}>
          <Icon size={18} />
        </span>
        <span>
          <small>{workflowActionTypes[a.type].toUpperCase()}</small>
          <strong>{actionLabel(a)}</strong>
          {a.type === "task" || a.type === "commitment" ? <em>Échéance J+{a.days ?? 1}</em> : null}
        </span>
      </button>
      <div className={styles.nodeTools}>
        <button aria-label="Monter ce bloc" onClick={() => onMove(a.id!, -1)}>
          <ArrowUp size={13} />
        </button>
        <button aria-label="Descendre ce bloc" onClick={() => onMove(a.id!, 1)}>
          <ArrowDown size={13} />
        </button>
        {onCopy && (
          <button aria-label="Dupliquer ce bloc" onClick={() => onCopy(a.id!)}>
            <Copy size={13} />
          </button>
        )}
        <button aria-label="Supprimer ce bloc" onClick={() => onDelete(a.id!)}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
