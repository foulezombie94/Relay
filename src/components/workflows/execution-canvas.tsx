"use client";
import { useState } from "react";
import { Check, Clock3, Circle, AlertCircle, Loader2, GitBranch, SkipForward } from "lucide-react";
import type { WorkflowAction, WorkflowDefinition } from "@/lib/domain/types";
import { actionLabel } from "@/lib/domain/workflows";
import { workflowActionTypes } from "@/lib/domain/workflow-templates";
import styles from "./workflows.module.css";
export type StepRun = {
  step_key: string;
  action_id?: string;
  position: number;
  type: string;
  title: string;
  status: string;
  started_at?: string;
  completed_at?: string;
  next_at?: string;
  error_code?: string;
  output: Record<string, unknown>;
};
const states: Record<string, string> = {
  queued: "À venir",
  running: "En cours",
  waiting: "En attente",
  completed: "Réussi",
  failed: "Échec",
  skipped: "Non parcouru",
  unknown: "Résultat à vérifier",
};
const icons = {
  queued: Circle,
  running: Loader2,
  waiting: Clock3,
  completed: Check,
  failed: AlertCircle,
  skipped: SkipForward,
  unknown: AlertCircle,
};
export function ExecutionCanvas({
  definition,
  steps,
}: {
  definition?: WorkflowDefinition;
  steps: StepRun[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const active =
    steps.find((s) => s.step_key === selected) ??
    steps.find((s) => ["running", "waiting", "failed", "unknown"].includes(s.status)) ??
    steps.find((s) => s.status === "queued") ??
    steps.at(-1);
  const done = steps.filter((s) => s.status === "completed").length;
  function node(a: WorkflowAction, key: string) {
    const step = steps.find((s) => s.step_key === key),
      status = step?.status ?? "queued",
      Icon = icons[status as keyof typeof icons] ?? Circle;
    return (
      <div key={key} className={styles.flowStep}>
        <button
          type="button"
          className={styles.executionNode}
          data-state={status}
          data-selected={active?.step_key === key}
          onClick={() => setSelected(key)}
        >
          <span className={styles.executionIcon}>
            <Icon size={18} className={status === "running" ? styles.spinning : undefined} />
          </span>
          <span>
            <small>{workflowActionTypes[a.type]}</small>
            <strong>{actionLabel(a)}</strong>
            <em>{states[status]}</em>
          </span>
          {a.type === "branch" && <GitBranch size={16} />}
        </button>
        {a.type === "branch" && (
          <div className={styles.branches}>
            {(["then", "otherwise"] as const).map((side) => (
              <div className={styles.branch} key={side}>
                <span className={styles.branchLabel}>{side === "then" ? "Oui" : "Non"}</span>
                {(a[side] ?? []).map((child, i) =>
                  node(child, `${key}.${side === "then" ? "yes" : "no"}.${i}`),
                )}
                {!a[side]?.length && <small>Aucune action</small>}
              </div>
            ))}
          </div>
        )}
        <div className={styles.connector} />
      </div>
    );
  }
  return (
    <>
      <div className={styles.runProgress}>
        <strong>{done} bloc(s) réussi(s)</strong>
        <span>
          {steps.filter((s) => s.status === "skipped").length} non parcouru(s) · {steps.length} au
          total
        </span>
        <progress
          max={Math.max(1, steps.length)}
          value={steps.filter((s) => ["completed", "skipped"].includes(s.status)).length}
          aria-label="Avancement réel des blocs"
        />
      </div>
      <div className={styles.executionLayout}>
        <div className={styles.canvas}>
          <div className={styles.canvasCaption}>SUIVI EN DIRECT · VERSION EXÉCUTÉE</div>
          {definition?.actions.map((a, i) => node(a, `root.${i}`)) ??
            steps.map((s) =>
              node({ type: s.type as WorkflowAction["type"], title: s.title }, s.step_key),
            )}
          <div className={styles.endNode}>Fin du processus</div>
        </div>
        <aside className={styles.inspector}>
          {active ? (
            <>
              <div className={styles.inspectorHeading}>
                <span>DÉTAIL DU BLOC</span>
                <h3>{active.title}</h3>
                <p>{states[active.status]}</p>
              </div>
              {active.started_at && (
                <p className="caption">
                  Début : {new Date(active.started_at).toLocaleString("fr-FR")}
                </p>
              )}
              {active.completed_at && (
                <p className="caption">
                  Fin : {new Date(active.completed_at).toLocaleString("fr-FR")}
                </p>
              )}
              {active.next_at && active.status === "waiting" && (
                <p className={styles.help}>
                  Prochaine vérification : {new Date(active.next_at).toLocaleString("fr-FR")}
                </p>
              )}
              {active.error_code && (
                <div className="alert error">
                  {active.error_code === "delivery_uncertain"
                    ? "Le fournisseur a peut-être exécuté cette action. Vérifiez avant de choisir la suite."
                    : active.error_code === "wait_timeout"
                      ? "Le délai maximal d’attente est dépassé."
                      : "Le bloc a échoué. Consultez le message de l’exécution et corrigez sa configuration."}
                </div>
              )}
              <h4>Sortie du bloc</h4>
              {Object.keys(active.output ?? {}).length ? (
                <pre className={styles.output}>{JSON.stringify(active.output, null, 2)}</pre>
              ) : (
                <p className="caption">Le résultat s’affichera après validation de l’action.</p>
              )}
              <p className="caption">
                Cliquez sur un bloc pour consulter son état. L’avancement provient du worker et
                reste enregistré après fermeture de cette fenêtre.
              </p>
            </>
          ) : (
            <p>Aucun bloc disponible.</p>
          )}
        </aside>
      </div>
    </>
  );
}
