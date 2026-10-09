export type PulseSignal = {
  kind: "email" | "deal" | "commitment";
  detected: boolean;
  source_id?: string;
  record_id?: string;
  label?: string;
};
export type AssistantPulse = {
  counts: {
    attention: number;
    opportunities: number;
    open_tasks: number;
    overdue_tasks: number;
    due_commitments: number;
    open_conflicts: number;
  };
  signals: PulseSignal[];
  generated_at: string;
  email_candidates_scanned: number;
};
export const pulseOverviewPrompt =
  "Fais mon bilan CRM en lecture seule : compte les opportunités et tâches ouvertes, retrouve les tâches en retard et engagements à échéance, puis analyse les risques et échanges qui méritent une réponse. Privilégie les agrégations pour les totaux, cite les sources accessibles et précise les recherches partielles et incertitudes. Propose les prochaines actions sans les exécuter.";

export function pulseAnalysisPrompt(signal: PulseSignal) {
  // Only typed identifiers enter the request. Labels from CRM sources remain display data.
  const id = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  const record = signal.record_id && id.test(signal.record_id) ? signal.record_id : undefined;
  const source = signal.source_id && id.test(signal.source_id) ? signal.source_id : undefined;
  const scope = record ? ` Fiche concernée : ${record}.` : "";
  if (signal.kind === "email")
    return `Analyse en lecture seule les échanges${source ? ` correspondant à l’email ${source}` : " récents accessibles"}.${scope} Vérifie le fil et les messages suivants pour déterminer si une réponse est réellement attendue. Cite tes sources et précise les limites des données importées. Propose un suivi sans l’exécuter.`;
  if (signal.kind === "deal")
    return `Analyse en lecture seule ${record ? "cette opportunité" : "les opportunités accessibles"}.${scope} Vérifie les échanges, activités, prochaines tâches et engagements avant de conclure à un blocage. Cite tes sources et propose les prochaines étapes sans les exécuter.`;
  return `Analyse en lecture seule les engagements confirmés qui arrivent à échéance ou sont en retard${source ? `, notamment l’engagement ${source}` : ""}.${scope} Vérifie les preuves et tâches associées. Cite les sources et propose les prochaines actions sans les exécuter.`;
}
