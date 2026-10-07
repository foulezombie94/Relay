import type { Condition, CrmRecord, Simulation, Workflow, WorkflowAction } from "./types";
export function valueOf(record: CrmRecord, field: string): unknown {
  return field.startsWith("attributes.") ? record.attributes[field.slice(11)] : record[field];
}
export function matches(
  record: CrmRecord,
  conditions: Condition[],
  mode: "all" | "any" = "all",
): boolean {
  const test = (c: Condition) => {
    const v = valueOf(record, c.field),
      present = v !== null && v !== undefined && v !== "";
    switch (c.operator) {
      case "exists":
        return present;
      case "not_exists":
        return !present;
      case "equals":
        return String(v ?? "") === String(c.value ?? "");
      case "not_equals":
        return String(v ?? "") !== String(c.value ?? "");
      case "contains":
        return String(v ?? "")
          .toLowerCase()
          .includes(String(c.value ?? "").toLowerCase());
      case "gt":
        return present && Number.isFinite(Number(v)) && Number(v) > Number(c.value);
      case "lt":
        return present && Number.isFinite(Number(v)) && Number(v) < Number(c.value);
      case "before":
        return present && String(v).slice(0, 10) < String(c.value);
      case "after":
        return present && String(v).slice(0, 10) > String(c.value);
    }
  };
  return !conditions.length || (mode === "any" ? conditions.some(test) : conditions.every(test));
}
export function actionLabel(a: WorkflowAction): string {
  const fields: Record<string, string> = {
    stage: "l’étape",
    owner_id: "le responsable",
    close_date: "la clôture prévue",
    probability: "la probabilité",
  };
  switch (a.type) {
    case "task":
      return a.title || "Créer une tâche";
    case "commitment":
      return a.title || "Proposer un engagement";
    case "note":
      return a.title || "Ajouter une note";
    case "add_to_list":
      return "Ajouter à une liste";
    case "set_field":
      return `Modifier ${fields[a.field ?? ""] ?? "une information"} → ${a.value || "Non renseigné"}`;
    case "delay":
      return `Attendre ${a.minutes ?? 60} minute(s)`;
    case "branch":
      return "Vérifier une condition · Oui / Non";
    case "email":
      return "Email historique · à remplacer";
  }
}
export function simulate(workflow: Workflow, records: CrmRecord[], now = new Date()): Simulation {
  const warnings = new Set<string>();
  const eligible = records.filter(
    (r) =>
      !r.archived &&
      r.object_id === workflow.definition.object_id &&
      matches(r, workflow.definition.conditions, workflow.definition.condition_mode),
  );
  const changes = (
    actions: WorkflowAction[],
    record: CrmRecord,
  ): Simulation["records"][number]["changes"] =>
    actions.flatMap((a) => {
      if (a.type === "branch") {
        const yes = matches(record, a.conditions ?? [], a.condition_mode);
        warnings.add(
          "Les branches sont estimées avec les valeurs actuelles ; elles sont recalculées à leur exécution.",
        );
        return [
          { type: "branch", description: `Branche estimée : ${yes ? "Oui" : "Non"}` },
          ...changes(yes ? (a.then ?? []) : (a.otherwise ?? []), record),
        ];
      }
      if (a.type === "delay")
        warnings.add(
          "Les délais sont planifiés sans bloquer le serveur. Les critères sont vérifiés à nouveau à la reprise.",
        );
      if (a.type === "email")
        warnings.add(
          "Remplacez les anciennes actions email. Les envois programmés passent par Séquences.",
        );
      return [
        {
          type: a.type,
          field: a.field,
          value: a.value,
          title: a.title,
          body: a.body,
          description: actionLabel(a),
        },
      ];
    });
  return {
    workflow_id: workflow.id,
    workflow_version: workflow.version,
    created_at: now.toISOString(),
    records: eligible.map((r) => ({
      id: r.id,
      version: r.version,
      display_name: r.display_name,
      changes: changes(workflow.definition.actions, r),
    })),
    warnings: [...warnings],
  };
}
