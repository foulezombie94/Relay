"use client";
import { useState } from "react";
import { Pencil, Trash2, Check, FileText } from "lucide-react";
import { useRows, useSave, useWorkspace } from "../data-provider";
import {
  AddButton,
  Editor,
  Empty,
  PageHeader,
  Loading,
  ErrorMessage,
  Badge,
  date,
  str,
  SearchBox,
  type Field,
} from "../ui";
import type { Row, CrmRecord } from "@/lib/domain/types";
import { PortalDetails } from "./portal-details";
const titleField: Field = { key: "title", label: "Titre", required: true };
const statusField = (values: string[]): Field => ({
  key: "status",
  label: "Statut",
  type: "select",
  options: values.map((v) => ({
    value: v,
    label:
      (
        {
          open: "À traiter",
          in_progress: "En cours",
          done: "Réalisé",
          cancelled: "Annulé",
          proposed: "À confirmer",
          confirmed: "Confirmé",
          postponed: "Reporté",
          resolved: "Résolu",
          dismissed: "Écarté",
          draft: "Brouillon",
          approved: "Validé",
          completed: "Terminé",
        } as Record<string, string>
      )[v] ?? v,
  })),
});
const configs: Record<
  string,
  {
    title: string;
    description: string;
    fields: Field[];
    initial?: Record<string, unknown>;
  }
> = {
  tasks: {
    title: "Tâches",
    description: "Vos prochaines actions, au bon endroit.",
    fields: [
      titleField,
      { key: "description", label: "Description", type: "textarea" },
      { key: "due_date", label: "Échéance", type: "datetime-local" },
      statusField(["open", "in_progress", "done", "cancelled"]),
      {
        key: "priority",
        label: "Priorité",
        type: "select",
        options: ["low", "normal", "high"].map((v) => ({
          value: v,
          label: v === "high" ? "Haute" : v === "low" ? "Basse" : "Normale",
        })),
      },
    ],
    initial: { status: "open", priority: "normal" },
  },
  notes: {
    title: "Notes",
    description: "Les informations utiles à toute votre équipe.",
    fields: [
      { key: "title", label: "Titre" },
      { key: "content", label: "Contenu", type: "textarea", required: true },
      { key: "private", label: "Visible uniquement par moi", type: "checkbox" },
    ],
  },
  meetings: {
    title: "Réunions",
    description: "Conservez et analysez le contexte de vos échanges.",
    fields: [
      titleField,
      { key: "starts_at", label: "Date de réunion", type: "datetime-local" },
      { key: "transcript", label: "Transcription importée", type: "textarea" },
      { key: "summary", label: "Résumé", type: "textarea" },
    ],
  },
  commitments: {
    title: "Engagements",
    description:
      "Chaque promesse a un responsable, une échéance et une preuve.",
    fields: [
      titleField,
      { key: "due_date", label: "Échéance", type: "datetime-local" },
      statusField([
        "proposed",
        "confirmed",
        "in_progress",
        "done",
        "postponed",
        "cancelled",
      ]),
      { key: "source_quote", label: "Passage source", type: "textarea" },
      { key: "evidence", label: "Preuve de réalisation", type: "textarea" },
      {
        key: "uncertainty",
        label: "Informations à confirmer",
        type: "textarea",
      },
    ],
    initial: { status: "proposed" },
  },
  conflicts: {
    title: "Contradictions",
    description: "Clarifiez les écarts avant qu’ils deviennent des problèmes.",
    fields: [
      titleField,
      { key: "field", label: "Information concernée", required: true },
      {
        key: "source_a",
        label: "Première source — label, quote, value",
        type: "json",
        required: true,
      },
      {
        key: "source_b",
        label: "Deuxième source — label, quote, value",
        type: "json",
        required: true,
      },
      statusField(["open", "resolved", "dismissed"]),
      {
        key: "resolution",
        label: "Décision et justification",
        type: "textarea",
      },
    ],
    initial: {
      status: "open",
      source_a: { label: "Devis", quote: "", value: "" },
      source_b: { label: "Email", quote: "", value: "" },
    },
  },
  handovers: {
    title: "Réalisation",
    description: "Transmettez précisément ce qui a été vendu.",
    fields: [
      titleField,
      { key: "scope", label: "Périmètre accepté", type: "textarea" },
      { key: "exclusions", label: "Exclusions", type: "textarea" },
      statusField(["draft", "approved", "completed"]),
      {
        key: "milestones",
        label: "Jalons — tableau de title, date, done",
        type: "json",
      },
    ],
    initial: { status: "draft", milestones: [] },
  },
  sequences: {
    title: "Séquences",
    description: "Préparez les étapes de vos suivis commerciaux.",
    fields: [
      { key: "name", label: "Nom", required: true },
      {
        key: "steps",
        label: "Étapes — subject, body, delay_days",
        type: "json",
        required: true,
      },
    ],
    initial: {
      steps: [
        {
          subject: "Suite à notre échange",
          body: "Bonjour {{display_name}},",
          delay_days: 1,
        },
      ],
    },
  },
  lists: {
    title: "Listes",
    description: "Organisez vos fiches sans dupliquer vos données.",
    fields: [
      { key: "name", label: "Nom", required: true },
      {
        key: "visibility",
        label: "Visibilité",
        type: "select",
        options: [
          { value: "workspace", label: "Tout l’espace" },
          { value: "private", label: "Moi uniquement" },
        ],
      },
    ],
    initial: { visibility: "workspace" },
  },
  portals: {
    title: "Portails clients",
    description:
      "Partagez uniquement les éléments que vos clients doivent voir.",
    fields: [
      { key: "name", label: "Nom du portail", required: true },
      { key: "enabled", label: "Accès activé", type: "checkbox" },
    ],
    initial: { enabled: true },
  },
};
export function ResourcePage({ resource }: { resource: string }) {
  const config = configs[resource];
  const { workspace, objects, user } = useWorkspace();
  const q = useRows(resource, { size: 100 });
  const records = useRows<CrmRecord>("records", { size: 100 });
  const members = useRows("memberships", { size: 100 });
  const { save, remove, busy } = useSave();
  const [editor, setEditor] = useState<Row | true | null>(null);
  const [search, setSearch] = useState("");
  const [portal, setPortal] = useState<Row | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const readOnly = workspace.role === "viewer";
  if (!config) return <Empty title="Page introuvable" />;
  const fields = [...config.fields];
  if (!editor || editor === true) {
    if (resource === "lists")
      fields.push({
        key: "object_id",
        label: "Type de fiche",
        type: "select",
        required: true,
        options: objects.map((o) => ({ value: o.id, label: o.name })),
      });
    else if (
      [
        "tasks",
        "notes",
        "meetings",
        "commitments",
        "conflicts",
        "handovers",
        "portals",
      ].includes(resource)
    )
      fields.push({
        key: "record_id",
        label:
          resource === "handovers" ? "Opportunité gagnée" : "Fiche associée",
        type: "select",
        required: ["handovers", "portals"].includes(resource),
        options: (records.data?.data ?? [])
          .filter((r) => resource !== "handovers" || r.stage === "Gagné")
          .map((r) => ({ value: r.id, label: r.display_name })),
      });
  }
  if (["tasks", "commitments", "handovers"].includes(resource))
    fields.push({
      key: "owner_id",
      label: "Responsable",
      type: "select",
      options: (members.data?.data ?? []).map((m) => ({
        value: str(m.user_id),
        label: str(m.display_name) || str(m.user_id),
      })),
    });
  const rows = (q.data?.data ?? []).filter((r) =>
    (str(r.title || r.name) + " " + str(r.content))
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title={config.title}
        description={config.description}
        action={
          <AddButton
            disabled={readOnly}
            label={resource === "notes" ? "Nouvelle note" : "Ajouter"}
            onClick={() => setEditor(true)}
          />
        }
      />
      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} />
        <span className="pill">{q.data?.count ?? 0} éléments</span>
      </div>
      {resource === "sequences" && (
        <div className="alert info">
          Les séquences peuvent être préparées et sauvegardées. L’envoi
          nécessite un compte de messagerie connecté et un moteur d’envoi
          configuré.
        </div>
      )}
      <ErrorMessage error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty
          title={"Aucun élément dans " + config.title.toLowerCase()}
          action={
            <AddButton disabled={readOnly} onClick={() => setEditor(true)} />
          }
        />
      ) : (
        <div className="stack">
          {rows.map((row) => (
            <article key={row.id} className="detail-card">
              <div className="card-head">
                <div>
                  <h3
                    onClick={() =>
                      setExpanded(expanded === row.id ? null : row.id)
                    }
                    style={{ cursor: "pointer" }}
                  >
                    {str(row.title || row.name) || "Sans titre"}
                  </h3>
                  <small>
                    {date(row.due_date || row.starts_at || row.created_at)}
                    {row.record_id
                      ? " · " +
                        (records.data?.data.find((r) => r.id === row.record_id)
                          ?.display_name ?? "Fiche associée")
                      : ""}
                  </small>
                </div>
                <div className="row-actions">
                  {row.status ? <Badge value={row.status} /> : null}
                  {resource === "portals" && (
                    <button
                      className="button small"
                      onClick={() => setPortal(row)}
                    >
                      Gérer le partage
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label="Modifier"
                    disabled={readOnly}
                    onClick={() => setEditor(row)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Supprimer"
                    disabled={readOnly || busy}
                    onClick={() => {
                      if (window.confirm("Retirer cet élément ?"))
                        void remove(resource, row.id).catch(() => {});
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {(resource === "notes" || expanded === row.id) && (
                <p>
                  {str(
                    row.content ||
                      row.description ||
                      row.transcript ||
                      row.scope,
                  )}
                </p>
              )}
              {row.source_quote ? (
                <blockquote className="quote">
                  {str(row.source_quote)}
                </blockquote>
              ) : null}
              {resource === "conflicts" && (
                <div className="split">
                  {["source_a", "source_b"].map((key) => {
                    const source = (row[key] ?? {}) as Record<string, unknown>;
                    return (
                      <blockquote key={key} className="quote">
                        <strong>{str(source.label)}</strong>
                        <p>{str(source.quote)}</p>
                        <Badge value={source.value} />
                      </blockquote>
                    );
                  })}
                </div>
              )}
              {row.evidence ? (
                <p>
                  <strong>Preuve :</strong> {str(row.evidence)}
                </p>
              ) : null}
              {row.resolution ? (
                <p>
                  <strong>Décision :</strong> {str(row.resolution)}
                </p>
              ) : null}
              {resource === "handovers" && expanded === row.id && (
                <>
                  <p>
                    <strong>Exclusions :</strong> {str(row.exclusions)}
                  </p>
                  <pre className="quote">
                    {JSON.stringify(row.commitments_snapshot, null, 2)}
                  </pre>
                </>
              )}
              {resource === "tasks" && row.status !== "done" && (
                <div className="card-actions">
                  <button
                    className="button small"
                    disabled={readOnly || busy}
                    onClick={() =>
                      save(resource, { status: "done" }, row).catch(() => {})
                    }
                  >
                    <Check size={13} />
                    Terminer
                  </button>
                </div>
              )}
              {resource === "lists" && (
                <div className="card-actions">
                  <a className="button small" href={"/app/list-" + row.id}>
                    <FileText size={13} />
                    Ouvrir la liste
                  </a>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {editor && (
        <Editor
          key={typeof editor === "object" ? editor.id : "new"}
          open
          onClose={() => setEditor(null)}
          title={
            (editor === true ? "Ajouter : " : "Modifier : ") + config.title
          }
          fields={fields}
          initial={editor === true ? (config.initial ?? {}) : editor}
          busy={busy}
          onSave={(v) => {
            if (
              editor === true &&
              ["tasks", "commitments", "handovers"].includes(resource) &&
              !v.owner_id
            )
              v.owner_id = user.id;
            return save(resource, v, editor === true ? undefined : editor);
          }}
        />
      )}
      {portal && (
        <PortalDetails portal={portal} onClose={() => setPortal(null)} />
      )}
    </>
  );
}
