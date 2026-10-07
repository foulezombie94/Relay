import type { WorkflowDefinition, WorkflowAction } from "./types";
export const workflowTriggers = {
  manual: "Lancement manuel",
  record_created: "Une fiche est créée",
  record_updated: "Une information change",
  stage_changed: "L’étape change",
  email_received: "Un email est reçu",
  email_replied: "Une réponse email est reçue",
  task_completed: "Une tâche est terminée",
  commitment_overdue: "Un engagement est en retard",
  date_reached: "Une date de fiche est atteinte",
  meeting_completed: "Une réunion est terminée",
  form_received: "Un formulaire signé est reçu",
  webhook: "Un webhook signé est reçu",
  schedule: "À une heure planifiée",
} as const;
export const workflowActionTypes = {
  task: "Créer une tâche",
  commitment: "Proposer un engagement",
  set_field: "Modifier une information",
  note: "Ajouter une note",
  add_to_list: "Ajouter à une liste",
  delay: "Attendre",
  branch: "Branche Si / Sinon",
  email: "Envoyer un email",
  calendar: "Créer un événement calendrier",
  slack: "Publier dans Slack",
  webhook: "Appeler un webhook",
  ai: "Analyser avec l’IA",
  wait_until: "Attendre une date ou un événement",
  notify: "Notifier dans À traiter",
} as const;
export const workflowStatuses: Record<string, string> = {
  queued: "En file",
  running: "En cours",
  waiting: "En attente",
  paused: "En pause",
  completed: "Terminée",
  failed: "À corriger",
  cancelled: "Annulée",
  skipped: "Critères non remplis",
  unknown: "Envoi à vérifier",
};
export function newWorkflowAction(type: keyof typeof workflowActionTypes): WorkflowAction {
  const id = crypto.randomUUID();
  switch (type) {
    case "email":
      return {
        id,
        type,
        provider: "gmail",
        to: "{{contact.email}}",
        subject: "Suite à notre échange",
        body: "Bonjour {{contact.first_name}},",
      };
    case "calendar":
      return {
        id,
        type,
        provider: "google-calendar",
        title: "Suivi de {{company.name}}",
        starts_at: "",
        duration_minutes: 30,
      };
    case "slack":
      return { id, type, body: "Une action est attendue pour {{record.name}}." };
    case "webhook":
      return { id, type, body: '{"record_id":"{{record.id}}","name":"{{record.name}}"}' };
    case "ai":
      return {
        id,
        type,
        alias: "analyse",
        input: "{{event.body}}",
        instruction: "Résume cet échange et identifie l’intention et la prochaine action utile.",
      };
    case "wait_until":
      return {
        id,
        type,
        wait_mode: "condition",
        conditions: [{ field: "stage", operator: "equals", value: "Négociation" }],
        timeout_minutes: 10080,
        timeout_behavior: "stop",
      };
    case "notify":
      return { id, type, title: "Suivi attendu pour {{record.name}}", owner: "runner" };
    case "task":
      return { id, type, title: "Contacter le prospect", days: 1, owner: "record" };
    case "commitment":
      return { id, type, title: "Préparer le lancement client", days: 7, owner: "record" };
    case "note":
      return { id, type, title: "Contexte du processus", body: "" };
    case "set_field":
      return { id, type, field: "stage", value: "Qualification" };
    case "add_to_list":
      return { id, type };
    case "delay":
      return { id, type, minutes: 1440 };
    case "branch":
      return {
        id,
        type,
        conditions: [{ field: "amount", operator: "gt", value: 10000 }],
        then: [newWorkflowAction("task")],
        otherwise: [],
      };
  }
}
export const workflowTemplates = [
  {
    id: "qualification",
    name: "Traiter un nouveau prospect",
    description: "Créer la première action dès l’arrivée d’un contact.",
    group: "Prospection",
    object: "people",
    stage: "",
    trigger: "record_created",
    actions: [{ type: "task", title: "Qualifier le nouveau contact", days: 1, owner: "record" }],
  },
  {
    id: "proposal",
    name: "Suivre une proposition",
    description: "Attendre deux jours puis rappeler au commercial de relancer.",
    group: "Ventes",
    object: "deals",
    stage: "Proposition",
    trigger: "stage_changed",
    actions: [
      { type: "delay", minutes: 2880 },
      { type: "task", title: "Relancer la proposition", days: 0, owner: "record" },
    ],
  },
  {
    id: "handoff",
    name: "Préparer un client gagné",
    description: "Relier la vente à sa réalisation avec un engagement à confirmer.",
    group: "Réalisation",
    object: "deals",
    stage: "Gagné",
    trigger: "stage_changed",
    actions: [
      { type: "task", title: "Organiser le lancement avec le client", days: 2, owner: "record" },
      {
        type: "commitment",
        title: "Confirmer le périmètre et le calendrier de réalisation",
        days: 7,
        owner: "record",
      },
    ],
  },
  {
    id: "priority",
    name: "Adapter le suivi au montant",
    description: "Un suivi renforcé pour les opportunités de plus de 10 000 €.",
    group: "Ventes",
    object: "deals",
    stage: "Qualification",
    trigger: "stage_changed",
    actions: [
      {
        type: "branch",
        conditions: [{ field: "amount", operator: "gt", value: 10000 }],
        then: [{ type: "task", title: "Préparer un plan de compte", days: 1, owner: "record" }],
        otherwise: [
          { type: "task", title: "Préparer la découverte client", days: 2, owner: "record" },
        ],
      },
    ],
  },
  {
    id: "review",
    name: "Organiser une revue de comptes",
    description: "Préparer une tâche sur les entreprises choisies après aperçu.",
    group: "Relation client",
    object: "companies",
    stage: "",
    trigger: "manual",
    actions: [{ type: "task", title: "Préparer la revue du compte", days: 7, owner: "record" }],
  },
] as const;
export function templateDefinition(
  template: (typeof workflowTemplates)[number],
  objectId: string,
): WorkflowDefinition {
  return {
    object_id: objectId,
    trigger: { type: template.trigger },
    reenrollment: "once",
    condition_mode: "all",
    conditions: template.stage
      ? [{ field: "stage", operator: "equals", value: template.stage }]
      : [],
    actions: JSON.parse(JSON.stringify(template.actions)),
  };
}
