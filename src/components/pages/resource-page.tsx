"use client";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Pagination } from "../ui/pagination";
import { RecordPicker } from "../records/picker";
import { SourceFields, RepeatFields } from "../ui/structured-fields";
import { Pencil, Trash2, Check, FileText } from "lucide-react";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
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
import { ResourceCard } from "../records/resource-card";
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
        label: "Première source",
        type: "custom",
        render: (initial, name) => (
          <SourceFields initial={initial} name={name} />
        ),
        required: true,
      },
      {
        key: "source_b",
        label: "Deuxième source",
        type: "custom",
        render: (initial, name) => (
          <SourceFields initial={initial} name={name} />
        ),
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
        label: "Jalons",
        type: "custom",
        render: (initial, name) => (
          <RepeatFields kind="milestones" initial={initial} name={name} />
        ),
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
        label: "Messages de la séquence",
        type: "custom",
        render: (initial, name) => (
          <RepeatFields kind="steps" initial={initial} name={name} />
        ),
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
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const focus = useSearchParams().get("focus") ?? undefined;
  const q = useRows(resource, {
    size: 25,
    page,
    id: focus,
    q: debounced,
    status,
    owner,
    due,
    sort: ["tasks", "commitments"].includes(resource) ? "due_date" : undefined,
    direction: ["tasks", "commitments"].includes(resource) ? "asc" : undefined,
  });

  const members = useRows("memberships", { size: 100 });
  const { save, remove, busy } = useSave();
  const [editor, setEditor] = useState<Row | true | null>(null);

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
        type: "custom",
        required: ["handovers", "portals"].includes(resource),
        render: (initial, name) => (
          <RecordPicker
            name={name}
            initial={initial}
            required={["handovers", "portals"].includes(resource)}
            objectId={
              resource === "handovers"
                ? objects.find((o) => o.slug === "deals")?.id
                : undefined
            }
            stage={resource === "handovers" ? "Gagné" : undefined}
          />
        ),
      });
  }
  if (["tasks", "commitments", "handovers"].includes(resource))
    fields.push({
      key: "owner_id",
      label: "Responsable",
      nullable: true,
      type: "select",
      options: (members.data?.data ?? []).map((m) => ({
        value: str(m.user_id),
        label: str(m.display_name) || str(m.user_id),
      })),
    });
  const rows = q.data?.data ?? [];
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
        {config.fields.some((field) => field.key === "status") && (
          <select
            aria-label="Filtrer le statut"
            style={{ width: "auto" }}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Tous les statuts</option>
            {config.fields
              .find((field) => field.key === "status")
              ?.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </select>
        )}
        {["tasks", "commitments", "handovers"].includes(resource) && (
          <select
            aria-label="Filtrer le responsable"
            style={{ width: "auto" }}
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Toute l’équipe</option>
            <option value="me">Mes éléments</option>
            <option value="unassigned">Sans responsable</option>
            {members.data?.data.map((member) => (
              <option key={member.id} value={str(member.user_id)}>
                {str(member.display_name)}
              </option>
            ))}
          </select>
        )}
        {["tasks", "commitments"].includes(resource) && (
          <select
            aria-label="Filtrer les échéances"
            style={{ width: "auto" }}
            value={due}
            onChange={(e) => {
              setDue(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Toutes les échéances</option>
            <option value="overdue">En retard</option>
            <option value="today">Aujourd’hui</option>
            <option value="upcoming">Les 7 prochains jours</option>
            <option value="undated">Sans date</option>
          </select>
        )}
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
            <ResourceCard
              key={row.id}
              row={row}
              resource={resource}
              expanded={expanded === row.id}
              readOnly={readOnly}
              busy={busy}
              onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
              onEdit={() => setEditor(row)}
              onPortal={() => setPortal(row)}
              onDelete={() => {
                if (window.confirm("Retirer cet élément ?"))
                  void remove(resource, row.id).catch(() => {});
              }}
              onComplete={() => {
                void save(resource, { status: "done" }, row).catch(() => {});
              }}
            />
          ))}
        </div>
      )}
      <Pagination
        page={page}
        size={25}
        total={q.data?.count ?? 0}
        busy={q.isFetching}
        onChange={setPage}
      />
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
