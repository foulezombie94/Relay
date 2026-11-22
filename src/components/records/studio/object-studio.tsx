"use client";
import { useRef, useState } from "react";
import {
  LayoutTemplate,
  Link2,
  Sigma,
  MousePointer2,
  FileText,
  ClipboardList,
  Plus,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import {
  studioInput,
  studioLabels,
  studioKinds,
  type StudioConfig,
  type StudioInput,
  type StudioKind,
} from "@/lib/domain/record-studio";
import type { Attribute, ObjectDefinition, Workflow } from "@/lib/domain/types";
import { useRows, useWorkspace } from "../../providers/data-provider";
import { Modal, ErrorMessage, Loading } from "../../ui";
import { useStudio, useStudioActions, type StudioData } from "./use-studio";
import { studioFields, newStudioConfig, type StudioField } from "./fields";
import {
  LayoutEditor,
  RelationEditor,
  RollupEditor,
  ButtonEditor,
  TemplateEditor,
  FormEditor,
} from "./config-editors";
import { FormView } from "./form-view";
import styles from "./studio.module.css";
import { DeleteButton } from "@/components/ui/delete-button";
const icons = {
  layout: LayoutTemplate,
  relation: Link2,
  rollup: Sigma,
  button: MousePointer2,
  template: FileText,
  form: ClipboardList,
};
const descriptions = {
  layout: "Organisez les informations visibles dans toutes les fiches.",
  relation: "Reliez vos contacts, entreprises et opportunités.",
  rollup: "Retrouvez les chiffres et les échéances des fiches liées.",
  button: "Lancez vos actions courantes depuis une fiche.",
  template: "Préparez les propriétés et le contenu des nouvelles fiches.",
  form: "Recueillez des réponses directement dans votre CRM.",
};
export function StudioTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="button small" onClick={onClick}>
      <Settings2 size={14} /> Personnaliser les fiches
    </button>
  );
}
export function ObjectStudio({
  object,
  onClose,
  initialKind = "layout",
}: {
  object: ObjectDefinition;
  onClose: () => void;
  initialKind?: StudioKind;
}) {
  const { workspace, objects } = useWorkspace();
  const [kind, setKind] = useState<StudioKind>(initialKind);
  const [selection, setSelection] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const q = useStudio(object.id);
  const attrs = useRows<Attribute>("attributes", { object_id: object.id, size: 100 });
  const workflows = useRows<Workflow>("workflows", { size: 100 });
  const members = useRows("memberships", { size: 100 });
  const fields = studioFields(attrs.data?.data ?? []);
  const configs = q.data?.data ?? [];
  const own = configs.filter((c) => c.kind === kind && c.object_id === object.id);
  const selected = own.find((c) => c.id === selection) ?? (selection === null ? own[0] : undefined);
  const readonly = !["owner", "admin"].includes(workspace.role);
  function choose(next: StudioKind) {
    if (busy) return;
    setKind(next);
    setSelection(null);
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Personnaliser · ${object.name}`}
      description="Ces réglages s’appliquent à toutes les fiches de ce répertoire."
      wide
      className={styles.studioModal}
    >
      <div className={styles.studioShell}>
        <nav className={styles.studioNav} aria-label="Personnalisation des fiches">
          <small>CONFIGURATION</small>
          {studioKinds.map((key) => {
            const Icon = icons[key];
            return (
              <button
                type="button"
                key={key}
                disabled={busy}
                data-active={kind === key}
                onClick={() => choose(key)}
              >
                <Icon size={16} />
                {studioLabels[key]}
                <span>
                  {configs.filter((c) => c.kind === key && c.object_id === object.id).length || ""}
                </span>
              </button>
            );
          })}
          <p>Les fiches de votre CRM, organisées pour votre équipe.</p>
        </nav>
        <div className={styles.studioMain}>
          <header className={styles.studioTitle}>
            <div>
              <h2>{studioLabels[kind]}</h2>
              <p>{descriptions[kind]}</p>
            </div>
            {kind !== "layout" && (
              <button
                type="button"
                className="button small"
                disabled={busy || readonly}
                onClick={() => {
                  setSelection("new");
                  setRevision((v) => v + 1);
                }}
              >
                <Plus size={14} /> Ajouter
              </button>
            )}
          </header>
          <ErrorMessage error={q.error || attrs.error || workflows.error || members.error} />
          {q.isPending || attrs.isPending ? (
            <Loading />
          ) : (
            <>
              {kind !== "layout" && own.length > 0 && (
                <div className={styles.configTabs}>
                  {own.map((row) => (
                    <button
                      type="button"
                      key={row.id}
                      disabled={busy}
                      data-active={selected?.id === row.id}
                      onClick={() => setSelection(row.id)}
                    >
                      {row.name}
                    </button>
                  ))}
                </div>
              )}
              {readonly && (
                <p className={styles.note}>
                  Seuls les administrateurs peuvent modifier ces réglages.
                </p>
              )}
              <ConfigEditor
                key={`${kind}:${selected?.id ?? "new"}:${revision}`}
                object={object}
                objects={objects}
                kind={kind}
                initial={selected}
                fields={fields}
                configs={configs}
                schedules={q.data?.schedules}
                workflows={(workflows.data?.data ?? []).filter(
                  (w) => w.definition.object_id === object.id,
                )}
                members={members.data?.data ?? []}
                readonly={readonly}
                onBusy={setBusy}
                onSaved={(row) => {
                  setSelection(row.id);
                  setRevision((v) => v + 1);
                }}
                onRemoved={() => {
                  setSelection(null);
                  setRevision((v) => v + 1);
                }}
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
function ConfigEditor({
  object,
  objects,
  kind,
  initial,
  fields,
  configs,
  workflows,
  members,
  readonly,
  onBusy,
  onSaved,
  onRemoved,
  schedules,
}: {
  object: ObjectDefinition;
  objects: ObjectDefinition[];
  kind: StudioKind;
  initial?: StudioConfig;
  fields: StudioField[];
  configs: StudioConfig[];
  workflows: Workflow[];
  members: import("@/lib/domain/types").Row[];
  readonly: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (row: StudioConfig) => void;
  onRemoved: () => void;
  schedules?: StudioData["schedules"];
}) {
  const actions = useStudioActions();
  const [name, setName] = useState(
    initial?.name ?? (kind === "layout" ? "Disposition des fiches" : ""),
  );
  const [config, setConfig] = useState<StudioInput["config"]>(
    () =>
      initial?.config ??
      newStudioConfig(kind, objects.find((o) => o.id !== object.id)?.id ?? object.id, fields),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [preview, setPreview] = useState(false);
  const schedule = schedules?.find((s) => s.config_id === initial?.id);
  async function execute(operation: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      guard.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <>
      <form
        className={styles.configForm}
        onSubmit={(e) => {
          e.preventDefault();
          void execute(async () => {
            const raw =
              kind === "template"
                ? {
                    ...config,
                    checklist: (
                      config as Extract<StudioInput, { kind: "template" }>["config"]
                    ).checklist.filter((line) => line.trim()),
                  }
                : config;
            const parsed = studioInput.safeParse({ object_id: object.id, name, kind, config: raw });
            if (!parsed.success)
              throw new Error(parsed.error.issues.map((i) => i.message).join(" "));
            const row = await actions.save(parsed.data, initial);
            toast.success("Configuration enregistrée");
            onSaved(row);
          });
        }}
      >
        <fieldset disabled={readonly || busy} className={styles.fieldset}>
          {kind !== "layout" && (
            <label>
              {kind === "button"
                ? "Nom du bouton"
                : kind === "form"
                  ? "Titre du formulaire"
                  : "Nom"}
              <input
                required
                maxLength={160}
                value={name}
                placeholder={
                  {
                    relation: "Ex. Partenaires",
                    rollup: "Ex. Montant des opportunités",
                    button: "Ex. Qualifier ce prospect",
                    template: "Ex. Revue client mensuelle",
                    form: "Ex. Demande de devis",
                    layout: "",
                  }[kind]
                }
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {kind === "layout" && (
            <LayoutEditor
              value={config as Extract<StudioInput, { kind: "layout" }>["config"]}
              onChange={setConfig}
              fields={fields}
              company={object.slug === "companies"}
            />
          )}
          {kind === "relation" && (
            <RelationEditor
              value={config as Extract<StudioInput, { kind: "relation" }>["config"]}
              onChange={setConfig}
              objects={objects}
            />
          )}
          {kind === "rollup" && (
            <RollupEditor
              value={config as Extract<StudioInput, { kind: "rollup" }>["config"]}
              onChange={setConfig}
              relations={configs.filter(
                (c) => c.kind === "relation" && (c.object_id === object.id || c.config.inverse),
              )}
            />
          )}
          {kind === "button" && (
            <ButtonEditor
              value={config as Extract<StudioInput, { kind: "button" }>["config"]}
              onChange={setConfig}
              workflows={workflows}
            />
          )}
          {kind === "template" && (
            <TemplateEditor
              value={config as Extract<StudioInput, { kind: "template" }>["config"]}
              onChange={setConfig}
              fields={fields}
              members={members}
              onError={setError}
            />
          )}
          {kind === "form" && (
            <FormEditor
              value={config as Extract<StudioInput, { kind: "form" }>["config"]}
              onChange={setConfig}
              fields={fields}
            />
          )}
        </fieldset>
        {schedule && (
          <p className={styles.note} role="status">
            {schedule.paused
              ? `Récurrence en pause après ${schedule.failure_count} échecs. Corrigez puis enregistrez le modèle pour reprendre.`
              : `Prochaine création : ${new Date(schedule.next_run).toLocaleString("fr-FR")}`}
            {schedule.last_error_code && ` · Code ${schedule.last_error_code}`}
          </p>
        )}
        {kind === "form" && (
          <div className={styles.share}>
            <button type="button" className="button small" onClick={() => setPreview(!preview)}>
              <Eye size={14} />
              {preview ? "Masquer l’aperçu" : "Aperçu"}
            </button>
            {initial && (
              <>
                <button
                  type="button"
                  className="button small"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        location.origin + "/forms/" + initial.share_key,
                      );
                      toast.success("Lien copié");
                    } catch {
                      setError("Le navigateur n’a pas autorisé la copie du lien.");
                    }
                  }}
                >
                  <Copy size={14} /> Copier le lien
                </button>
                <a
                  className="button small"
                  href={"/forms/" + initial.share_key}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} /> Ouvrir
                </a>
                <span>
                  {initial.kind === "form" && initial.config.published
                    ? "Publié"
                    : "Brouillon · enregistrez après publication"}
                </span>
              </>
            )}
          </div>
        )}
        <ErrorMessage error={error ? new Error(error) : null} />
        <footer className={styles.editorFooter}>
          {initial && (
            <DeleteButton
              label="Supprimer cette configuration"
              title="Supprimer cette configuration : les liens de cette relation seront également retirés"
              disabled={readonly || busy}
              onConfirm={() =>
                void execute(async () => {
                  await actions.remove(initial);
                  onRemoved();
                })
              }
            />
          )}
          <span className={styles.grow}>
            {kind === "layout"
              ? "Appliqué à toutes les fiches du répertoire"
              : "Visible par votre équipe"}
          </span>
          <button type="submit" className="button primary small" disabled={readonly || busy}>
            <Check size={14} />
            {busy
              ? "Enregistrement…"
              : kind === "layout"
                ? "Appliquer à toutes les fiches"
                : "Enregistrer"}
          </button>
        </footer>
      </form>
      {kind === "form" && preview && (
        <div className={styles.formPreview}>
          <FormView
            name={name}
            spec={config as Extract<StudioInput, { kind: "form" }>["config"]}
            preview
          />
        </div>
      )}
    </>
  );
}
