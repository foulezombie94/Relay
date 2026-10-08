"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { request, useWorkspace } from "../data-provider";
import type { AgentAction } from "@/lib/agent/contracts";
import styles from "./assistant.module.css";
const titles: Record<string, string> = {
  create_record: "Créer une fiche",
  update_record: "Modifier une fiche",
  create_task: "Créer une tâche",
  update_task: "Modifier une tâche",
  create_note: "Ajouter une note",
  update_note: "Modifier une note",
  draft_email: "Email",
  create_calendar_event: "Créer un rendez-vous",
  update_calendar_event: "Modifier un rendez-vous",
  cancel_calendar_event: "Annuler un rendez-vous",
  propose_commitment: "Proposer un engagement",
  update_commitment: "Mettre à jour un engagement",
  create_workflow_draft: "Créer un brouillon de workflow",
  update_workflow_draft: "Modifier un brouillon de workflow",
  add_to_list: "Ajouter à une liste",
  remove_from_list: "Retirer d’une liste",
};
const states: Record<string, string> = {
  draft: "Brouillon — aucun envoi",
  pending: "À confirmer",
  queued: "En attente du worker",
  sending: "En cours",
  sent: "Envoi confirmé par le fournisseur",
  completed: "Terminé",
  failed: "Échec",
  uncertain: "Statut incertain — vérifiez le fournisseur ; aucun renvoi automatique",
  cancelled: "Annulé",
};
const labels: Record<string, string> = {
  title: "Titre",
  display_name: "Nom",
  email: "Email",
  domain: "Domaine",
  subject: "Objet",
  to: "À",
  body: "Message",
  content: "Contenu",
  description: "Description",
  due_date: "Échéance",
  starts_at: "Début",
  ends_at: "Fin",
  stage: "Étape",
  amount: "Montant",
  currency: "Devise",
  status: "Statut",
  priority: "Priorité",
  private: "Note privée",
  source_quote: "Citation",
  evidence: "Preuve",
  uncertainty: "Incertitude",
  name: "Nom",
  probability: "Probabilité",
  close_date: "Clôture prévue",
  lost_reason: "Raison de perte",
};
export function AgentActions({ actions }: { actions: AgentAction[] }) {
  return (
    <section className={styles.proposals} aria-label="Actions et résultats">
      {actions.map((a) => (
        <Action key={a.id} initial={a} />
      ))}
    </section>
  );
}
function Action({ initial }: { initial: AgentAction }) {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/${workspace.id}/assistant/actions`;
  const query = useQuery({
    queryKey: ["agent-action", workspace.id, initial.id],
    queryFn: () => request<{ data: AgentAction }>(endpoint + "?id=" + initial.id),
    initialData: { data: initial },
    refetchInterval: (q) =>
      ["queued", "sending"].includes(q.state.data?.data.status ?? "") ? 3000 : false,
  });
  const a = query.data.data,
    values = (a.input.values ?? a.input) as Record<string, unknown>;
  const confirm = ["draft", "pending"].includes(a.status);
  async function act(operation: "confirm" | "cancel") {
    setBusy(true);
    try {
      const result = await request<{ data: AgentAction }>(endpoint, "POST", {
        id: a.id,
        operation,
      });
      cache.setQueryData(["agent-action", workspace.id, a.id], result);
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={styles.proposal}>
      <h3>{titles[a.kind] ?? "Action CRM"}</h3>
      <p role="status">
        <strong>{states[a.status] ?? a.status}</strong>
      </p>
      {typeof a.input.provider === "string" && <p>Compte : {a.input.provider}</p>}
      {Object.entries(values)
        .filter(([key, value]) => key in labels && value !== undefined && value !== null)
        .map(([key, value]) => (
          <p className="preserve" key={key}>
            <strong>{labels[key]} : </strong>
            {typeof value === "boolean" ? (value ? "Oui" : "Non") : String(value)}
          </p>
        ))}
      {a.kind.includes("workflow") && (
        <p>Le workflow restera un brouillon. Sa publication se fait depuis Workflows.</p>
      )}
      {a.kind.includes("workflow") &&
        !!values.definition &&
        typeof values.definition === "object" && (
          <WorkflowPreview value={values.definition as Record<string, unknown>} />
        )}
      {a.private_context && confirm && (
        <p>
          Cette action reprend des informations privées. Une tâche ou un workflow partagé les rendra
          visibles à l’équipe ; vérifiez son contenu.
        </p>
      )}
      {confirm && (
        <p>
          Vérifiez le contenu et les informations personnelles avant de confirmer. Cette action
          utilisera vos droits actuels.
        </p>
      )}
      {query.error && (
        <p role="alert">
          Le statut ne peut pas être actualisé. Vérifiez avant toute nouvelle action.
        </p>
      )}
      <footer>
        {confirm && (
          <button
            type="button"
            className="button primary small"
            disabled={busy || workspace.role === "viewer"}
            onClick={() => void act("confirm")}
          >
            {a.kind === "draft_email" ? "Confirmer l’envoi" : "Confirmer l’action"}
          </button>
        )}
        {["draft", "pending", "queued"].includes(a.status) && (
          <button
            type="button"
            className="button small"
            disabled={busy || workspace.role === "viewer"}
            onClick={() => void act("cancel")}
          >
            Annuler
          </button>
        )}
      </footer>
    </article>
  );
}
function WorkflowPreview({ value }: { value: Record<string, unknown> }) {
  const actions = Array.isArray(value.actions) ? value.actions : [];
  const conditions = Array.isArray(value.conditions) ? value.conditions : [];
  const types: Record<string, string> = {
    task: "Créer une tâche",
    note: "Ajouter une note",
    commitment: "Proposer un engagement",
  };
  return (
    <div>
      <p>
        Déclenchement manuel · {conditions.length} condition(s) ·{" "}
        {value.condition_mode === "any"
          ? "Au moins une doit correspondre"
          : "Toutes doivent correspondre"}
      </p>
      <ul>
        {conditions.map((c, i) => (
          <li key={i}>
            {String(c.field)} {String(c.operator)} {String(c.value)}
          </li>
        ))}
      </ul>
      <ol>
        {actions.map((a, i) => (
          <li key={i}>
            {types[String(a.type)] ?? "Action"} : {String(a.title)}
            {a.body && <p className="preserve">{String(a.body)}</p>}
            {a.days !== undefined && <p>Échéance : après {String(a.days)} jour(s)</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
