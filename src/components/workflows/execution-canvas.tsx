"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Circle, List, Pause, Play, RotateCcw } from "lucide-react";
import type { WorkflowAction, WorkflowDefinition } from "@/lib/domain/types";
import { actionLabel } from "@/lib/domain/workflows";
import { WorkflowCanvas, stepLabels } from "./canvas";
import { workflowGraph } from "./canvas-model";
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
export function ExecutionCanvas({
  definition,
  steps,
  runStatus = "queued",
  runList,
}: {
  definition?: WorkflowDefinition;
  steps: StepRun[];
  runStatus?: string;
  runList?: ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<"runs" | "block">(runList ? "runs" : "block");
  const [playing, setPlaying] = useState(false),
    [replayIndex, setReplayIndex] = useState(0);
  const resolved = useMemo(
    () =>
      definition ?? {
        object_id: "",
        conditions: [],
        actions: steps.map((s) => ({ type: s.type as WorkflowAction["type"], title: s.title })),
      },
    [definition, steps],
  );
  const graph = useMemo(() => workflowGraph(resolved), [resolved]);
  const completed = useMemo(
    () =>
      steps
        .filter((s) => s.status === "completed")
        .sort(
          (a, b) =>
            (a.completed_at ?? a.started_at ?? "").localeCompare(
              b.completed_at ?? b.started_at ?? "",
            ) || a.position - b.position,
        ),
    [steps],
  );
  const active =
    selected !== null
      ? steps.find((s) => s.step_key === selected)
      : (steps.find((s) => ["running", "waiting", "failed", "unknown"].includes(s.status)) ??
        steps.at(-1));
  const activeNode = graph.nodes.find((n) => n.key === (selected ?? active?.step_key));
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (replayIndex + 1 >= completed.length) {
        setPlaying(false);
        return;
      }
      setReplayIndex(replayIndex + 1);
      setSelected(completed[replayIndex + 1].step_key);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [playing, replayIndex, completed]);
  const terminal = ["completed", "failed", "cancelled", "skipped", "unknown"].includes(runStatus);
  return (
    <>
      <div className={styles.runProgress} aria-live="polite">
        <span className={styles.liveStatus} data-live={!terminal}>
          <Circle size={7} fill="currentColor" />
          {playing
            ? "Relecture du parcours enregistré"
            : terminal
              ? "Parcours enregistré"
              : "Suivi en direct"}
        </span>
        <span>
          {completed.length} réussi(s) · {steps.filter((s) => s.status === "skipped").length} non
          parcouru(s) · {steps.length} blocs
        </span>
        <progress
          max={Math.max(1, steps.length)}
          value={steps.filter((s) => ["completed", "skipped"].includes(s.status)).length}
          aria-label="Avancement réel des blocs"
        />
      </div>
      <div className={styles.executionLayout}>
        <WorkflowCanvas
          definition={resolved}
          steps={steps}
          runStatus={runStatus}
          selected={selected ?? active?.step_key}
          replayKey={playing ? completed[replayIndex]?.step_key : undefined}
          onSelect={(node) => {
            setSelected(node.key);
            setPanel("block");
            setPlaying(false);
          }}
          tools={
            terminal && completed.length > 0 ? (
              <button
                type="button"
                className="button small"
                aria-pressed={playing}
                onClick={() => {
                  if (playing) {
                    setPlaying(false);
                    return;
                  }
                  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
                    setSelected(completed.at(-1)!.step_key);
                    setPanel("block");
                    return;
                  }
                  setReplayIndex(0);
                  setSelected(completed[0].step_key);
                  setPanel("block");
                  setPlaying(true);
                }}
              >
                {playing ? <Pause size={13} /> : <RotateCcw size={13} />}
                {playing ? "Arrêter la relecture" : "Revoir le parcours"}
              </button>
            ) : (
              <span className={styles.liveStatus}>
                <Play size={12} />
                {stepLabels[runStatus] ?? runStatus}
              </span>
            )
          }
        />
        <aside className={styles.inspector}>
          {runList && (
            <div className={styles.panelTabs} role="group" aria-label="Panneau de l’exécution">
              <button
                type="button"
                aria-pressed={panel === "runs"}
                onClick={() => setPanel("runs")}
              >
                <List size={14} />
                Exécutions
              </button>
              <button
                type="button"
                aria-pressed={panel === "block"}
                onClick={() => setPanel("block")}
              >
                Détail du bloc
              </button>
            </div>
          )}
          {panel === "runs" && runList ? (
            runList
          ) : (
            <>
              <div className={styles.inspectorHeading}>
                {runList && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Revenir aux exécutions"
                    onClick={() => setPanel("runs")}
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <span>BLOC EXÉCUTÉ</span>
                <h3>
                  {activeNode?.action
                    ? actionLabel(activeNode.action)
                    : (active?.title ?? "Déclenchement")}
                </h3>
                <p>
                  {active
                    ? (stepLabels[active.status] ?? active.status)
                    : "Déclencheur et critères de la version exécutée"}
                </p>
              </div>
              {active ? (
                <>
                  <dl className={styles.stepTiming}>
                    {active.started_at && (
                      <>
                        <dt>Début</dt>
                        <dd>{new Date(active.started_at).toLocaleString("fr-FR")}</dd>
                      </>
                    )}
                    {active.completed_at && (
                      <>
                        <dt>Fin</dt>
                        <dd>{new Date(active.completed_at).toLocaleString("fr-FR")}</dd>
                      </>
                    )}
                    {active.next_at && active.status === "waiting" && (
                      <>
                        <dt>Reprise prévue</dt>
                        <dd>{new Date(active.next_at).toLocaleString("fr-FR")}</dd>
                      </>
                    )}
                  </dl>
                  {active.error_code && (
                    <div className="alert error">
                      {active.error_code === "delivery_uncertain"
                        ? "Le fournisseur a peut-être réalisé cette action. Vérifiez avant de choisir la suite."
                        : active.error_code === "wait_timeout"
                          ? "Le délai maximal d’attente est dépassé."
                          : "Ce bloc a échoué. Vérifiez la configuration et le message de l’exécution."}
                    </div>
                  )}
                  {activeNode?.action && (
                    <details className={styles.runData}>
                      <summary>Configuration exécutée</summary>
                      <pre className={styles.output}>
                        {JSON.stringify(activeNode.action, null, 2)}
                      </pre>
                    </details>
                  )}
                  <section className={styles.runData}>
                    <h4>Sortie du bloc</h4>
                    {Object.keys(active.output ?? {}).length ? (
                      <pre className={styles.output}>{JSON.stringify(active.output, null, 2)}</pre>
                    ) : (
                      <p className="caption">
                        {active.status === "skipped"
                          ? "Ce parcours n’a pas été exécuté."
                          : "Aucune sortie enregistrée pour ce bloc."}
                      </p>
                    )}
                  </section>
                </>
              ) : (
                <p className="caption">
                  Sélectionnez une action pour consulter son état, sa configuration et sa sortie.
                </p>
              )}
              <p className={styles.help}>
                Les états proviennent des exécutions enregistrées. La relecture anime le parcours
                sans relancer d’action.
              </p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
