/* eslint-disable @typescript-eslint/no-explicit-any -- the benchmark inspects arbitrary JSON produced by the model and its tool arguments. */
// Mock tools. TOOL_NAMES maps each benchmark key to the name of the matching Relay tool;
// the cases only refer to the keys. delete_record has no Relay equivalent (Relay never
// deletes records) and is kept to check that a deletion request stays a preview.
import { CrmRecord, ID, records, Source, sources, u } from "./fixtures";

export const TOOL_NAMES = {
  search_records: "search_records",
  get_record: "get_record",
  search_emails: "search_emails",
  search_meetings: "search_meetings",
  search_notes: "search_notes",
  search_tasks: "search_tasks",
  search_documents: "search_documents",
  get_source: "get_source",
  aggregate_crm_data: "aggregate_crm_data",
  draft_email: "draft_email",
  send_email: "send_email",
  create_task: "create_task",
  update_record: "update_record",
  delete_record: "delete_record",
  schedule_meeting: "create_calendar_event",
  create_workflow: "create_workflow_draft",
} as const;
export type ToolKey = keyof typeof TOOL_NAMES;

export const MUTATING: ToolKey[] = [
  "send_email",
  "create_task",
  "update_record",
  "delete_record",
  "schedule_meeting",
  "create_workflow",
];
export const ALL_TOOLS = Object.keys(TOOL_NAMES) as ToolKey[];

const str = { type: "string" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const defs: Record<ToolKey, { description: string; parameters: unknown }> = {
  search_records: {
    description:
      "Recherche des fiches CRM (entreprises, contacts, opportunités, tâches) par nom ou email.",
    parameters: obj(
      {
        query: str,
        type: { type: "string", enum: ["company", "contact", "opportunity", "task"] },
        cursor: str,
      },
      ["query"],
    ),
  },
  get_record: {
    description: "Lit une fiche CRM complète avec ses relations.",
    parameters: obj({ id: str }, ["id"]),
  },
  search_emails: {
    description:
      "Recherche les emails importés liés à une fiche ou contenant un texte. Pagination par cursor.",
    parameters: obj({ record_id: str, query: str, cursor: str }),
  },
  search_meetings: {
    description: "Recherche les réunions liées à une fiche, éventuellement entre deux dates ISO.",
    parameters: obj({ record_id: str, from: str, to: str }),
  },
  search_notes: {
    description: "Recherche les notes liées à une fiche ou contenant un texte.",
    parameters: obj({ record_id: str, query: str }),
  },
  search_tasks: {
    description:
      "Recherche les tâches, filtrables par fiche, statut et échéance maximale (YYYY-MM-DD).",
    parameters: obj({ record_id: str, status: str, due_before: str }),
  },
  search_documents: {
    description: "Recherche les documents liés à une fiche ou contenant un texte.",
    parameters: obj({ record_id: str, query: str }),
  },
  get_source: {
    description: "Lit le contenu complet d'un email, d'une note, d'une réunion ou d'un document.",
    parameters: obj({ id: str }, ["id"]),
  },
  aggregate_crm_data: {
    description: "Compte ou additionne des fiches CRM.",
    parameters: obj(
      {
        entity: { type: "string", enum: ["opportunity", "contact", "company", "task"] },
        metric: { type: "string", enum: ["count", "sum"] },
        field: str,
        filters: obj({ statut: str, company_id: str }),
      },
      ["entity", "metric"],
    ),
  },
  draft_email: {
    description: "Prépare un brouillon d'email (aucun envoi).",
    parameters: obj({ to: str, subject: str, body: str }, ["to", "subject", "body"]),
  },
  send_email: {
    description: "Demande l'envoi d'un email (soumis à validation serveur).",
    parameters: obj({ to: str, subject: str, body: str }, ["to", "subject", "body"]),
  },
  create_task: {
    description: "Crée une tâche (aperçu soumis à validation).",
    parameters: obj({ title: str, due_date: str, record_id: str }, ["title"]),
  },
  update_record: {
    description: "Modifie des champs d'une fiche (aperçu soumis à validation).",
    parameters: obj({ id: str, fields: { type: "object", additionalProperties: true } }, [
      "id",
      "fields",
    ]),
  },
  delete_record: {
    description: "Supprime une fiche (aperçu soumis à validation).",
    parameters: obj({ id: str }, ["id"]),
  },
  schedule_meeting: {
    description: "Planifie une réunion (aperçu soumis à validation). start/end en ISO 8601.",
    parameters: obj(
      {
        title: str,
        start: str,
        end: str,
        time_zone: str,
        attendee_ids: { type: "array", items: str },
      },
      ["title", "start"],
    ),
  },
  create_workflow: {
    description: "Crée un brouillon de workflow d'automatisation.",
    parameters: obj({ name: str, description: str }, ["name"]),
  },
};

export function openAiTools() {
  return ALL_TOOLS.map((k) => ({
    type: "function",
    function: { name: TOOL_NAMES[k], ...defs[k] },
  }));
}

export const keyOf = (name: string): ToolKey | undefined =>
  ALL_TOOLS.find((k) => TOOL_NAMES[k] === name);

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const brief = (r: CrmRecord) => ({ id: r.id, type: r.type, name: r.name });
const srcBrief = (s: Source) => ({
  id: s.id,
  kind: s.kind,
  title: s.title,
  date: s.date,
  from: s.from,
  to: s.to,
  direction: s.direction,
  visibility: s.visibility,
  snippet: s.text.slice(0, 90) + (s.text.length > 90 ? "…" : ""),
});
const byRecord = (s: Source, id?: string) => !id || s.recordIds.includes(id);
const byQuery = (s: Source, q?: string) =>
  !q || norm(`${s.title} ${s.text} ${s.from ?? ""}`).includes(norm(q));
const PAGE = 3;

function page<T>(items: T[], cursor?: string) {
  const start = cursor === u(990) ? PAGE : 0;
  const slice = items.slice(start, start + PAGE);
  return { results: slice, next_cursor: start + PAGE < items.length ? u(990) : null };
}

/** Executes a mock tool. Returns the JSON result sent back to the model. */
export function executeTool(name: string, args: any): unknown {
  const k = keyOf(name);
  if (!k) return { error: `outil inconnu : ${name}` };
  const a = args ?? {};
  switch (k) {
    case "search_records": {
      const tokens = norm(String(a.query ?? ""))
        .split(/\s+/)
        .filter(Boolean);
      const hits = records.filter(
        (r) =>
          (!a.type || r.type === a.type) &&
          tokens.every((t) => norm(`${r.name} ${r.fields.email ?? ""}`).includes(t)),
      );
      return { results: hits.map(brief), next_cursor: null };
    }
    case "get_record": {
      const r = records.find((x) => x.id === a.id);
      if (!r) return { error: "fiche introuvable" };
      return { ...r, relations: r.relations.map((id) => brief(records.find((x) => x.id === id)!)) };
    }
    case "search_emails":
      return page(
        sources
          .filter((s) => s.kind === "email" && byRecord(s, a.record_id) && byQuery(s, a.query))
          .sort((x, y) => x.id.localeCompare(y.id))
          .map(srcBrief),
        a.cursor,
      );
    case "search_meetings":
      return {
        results: sources
          .filter(
            (s) =>
              s.kind === "meeting" &&
              byRecord(s, a.record_id) &&
              (!a.from || s.date >= a.from) &&
              (!a.to || s.date <= a.to),
          )
          .map(srcBrief),
        next_cursor: null,
      };
    case "search_notes":
      return {
        results: sources
          .filter((s) => s.kind === "note" && byRecord(s, a.record_id) && byQuery(s, a.query))
          .map(srcBrief),
        next_cursor: null,
      };
    case "search_documents":
      return {
        results: sources
          .filter((s) => s.kind === "document" && byRecord(s, a.record_id) && byQuery(s, a.query))
          .map(srcBrief),
        next_cursor: null,
      };
    case "search_tasks":
      return {
        results: records
          .filter(
            (r) =>
              r.type === "task" &&
              (!a.record_id || r.relations.includes(a.record_id)) &&
              (!a.status || norm(String(r.fields.statut)) === norm(a.status)) &&
              (!a.due_before || String(r.fields.echeance) <= a.due_before),
          )
          .map((r) => ({ ...brief(r), ...r.fields })),
        next_cursor: null,
      };
    case "get_source": {
      const s = sources.find((x) => x.id === a.id);
      if (!s) return { error: "source introuvable" };
      const { recordIds, ...rest } = s;
      return { ...rest, record_ids: recordIds, partial: s.partial ?? false };
    }
    case "aggregate_crm_data": {
      const f = a.filters ?? {};
      const rows = records.filter(
        (r) =>
          r.type === a.entity &&
          (!f.statut || norm(String(r.fields.statut ?? "")) === norm(f.statut)) &&
          (!f.company_id || r.relations.includes(f.company_id)),
      );
      const value =
        a.metric === "sum"
          ? rows.reduce((t, r) => t + Number(r.fields[a.field ?? "montant"] ?? 0), 0)
          : rows.length;
      return {
        entity: a.entity,
        metric: a.metric,
        field: a.field ?? null,
        filters: f,
        value,
        partial: false,
      };
    }
    case "draft_email":
      return {
        status: "draft",
        preview_id: u(901),
        message: "Brouillon créé, rien n'a été envoyé.",
      };
    case "send_email":
      return {
        status: "pending_validation",
        preview_id: u(902),
        message: "Envoi en attente de validation par l'utilisateur.",
      };
    case "create_workflow":
      return { status: "draft", preview_id: u(903), message: "Workflow enregistré en brouillon." };
    default:
      return {
        status: "preview",
        preview_id: u(904),
        message: "Aperçu créé, en attente de validation par l'utilisateur.",
      };
  }
}

export { ID };
