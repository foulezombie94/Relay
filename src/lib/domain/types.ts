export type Role = "owner" | "admin" | "member" | "viewer";
export type Row = {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
};
export type Workspace = Row & {
  name: string;
  timezone: string;
  currency: string;
  locale: string;
  role: Role;
};
export type ObjectDefinition = Row & {
  name: string;
  slug: string;
  icon: string;
  standard: boolean;
};
export type Attribute = Row & {
  object_id: string;
  key: string;
  name: string;
  type: string;
  required: boolean;
  options: string[];
  archived: boolean;
};
export type CrmRecord = Row & {
  object_id: string;
  display_name: string;
  email: string | null;
  domain: string | null;
  stage: string;
  amount: string | number;
  currency: string;
  owner_id: string | null;
  attributes: Record<string, unknown>;
  archived: boolean;
  version: number;
  close_date: string | null;
  merged_into?: string | null;
  pipeline_id?: string | null;
  probability?: number | null;
  lost_reason?: string | null;
};
export type Workflow = Row & {
  name: string;
  description?: string;
  created_by?: string | null;
  published_version?: number | null;
  runner_id?: string | null;
  enabled: boolean;
  version: number;
  definition: WorkflowDefinition;
};
export type WorkflowDefinition = {
  object_id: string;
  conditions: Condition[];
  actions: WorkflowAction[];
  condition_mode?: "all" | "any";
  trigger?: { type: "manual" | "record_created" | "record_updated" | "stage_changed"; field?: string };
  reenrollment?: "once" | "on_change";
};
export type Condition = {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "gt" | "lt" | "exists" | "not_exists" | "before" | "after";
  value?: string | number;
};
export type WorkflowAction = {
  type: "task" | "set_field" | "email" | "note" | "commitment" | "add_to_list" | "delay" | "branch";
  id?: string;
  title?: string;
  field?: string;
  value?: string;
  body?: string;
  days?: number;
  owner_id?: string;
  owner?: "record" | "runner" | "selected";
  minutes?: number;
  list_id?: string;
  conditions?: Condition[];
  condition_mode?: "all" | "any";
  then?: WorkflowAction[];
  otherwise?: WorkflowAction[];
  lost_reason?: string;
};
export type Simulation = {
  workflow_id: string;
  workflow_version: number;
  records: {
    id: string;
    version: number;
    display_name: string;
    changes: {
      type: string;
      description: string;
      field?: string;
      value?: unknown;
      title?: string;
      due_date?: string;
      recipient?: string;
      body?: string;
    }[];
  }[];
  warnings: string[];
  created_at: string;
};
export const stages = [
  "Nouveau",
  "Qualification",
  "Proposition",
  "Négociation",
  "Gagné",
  "Perdu",
];
export const commitmentStatuses = [
  "proposed",
  "confirmed",
  "in_progress",
  "done",
  "postponed",
  "cancelled",
] as const;
export const statusLabels: Record<string, string> = {
  proposed: "À confirmer",
  confirmed: "Confirmé",
  in_progress: "En cours",
  done: "Réalisé",
  postponed: "Reporté",
  cancelled: "Annulé",
  open: "À traiter",
  resolved: "Résolu",
  dismissed: "Écarté",
  draft: "Brouillon",
  approved: "Validé",
  published: "Publié",
  pending: "En attente",
  completed: "Terminé",
  failed: "Échec",
  active: "Actif",
  paused: "En pause",
  replied: "Réponse reçue",
  unsubscribed: "Désabonné",
  preparing: "Préparation",
  sending: "Envoi en cours",
  sent: "Transmis",
  uncertain: "À vérifier",
  stopped: "Arrêté",
};
