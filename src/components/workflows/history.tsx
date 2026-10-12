"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3, ExternalLink, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { request, useWorkspace } from "../providers/data-provider";
import { ErrorMessage, Modal } from "../ui";
import { Pagination } from "../ui/pagination";
import { workflowStatuses, workflowTriggers } from "@/lib/domain/workflow-templates";
import type { Workflow, WorkflowDefinition } from "@/lib/domain/types";
import { ExecutionCanvas, type StepRun } from "./execution-canvas";
import styles from "./workflows.module.css";
export type Execution = {
  id: string;
  workflow_id: string;
  workflow_version: number;
  record_id: string;
  record_object_id?: string;
  record_name: string;
  source: keyof typeof workflowTriggers;
  status: string;
  next_at?: string;
  error_code?: string;
  created_at: string;
  trace: {
    type: string;
    title: string;
    at: string;
    result?: string;
    resume_at?: string;
    minutes?: number;
  }[];
};
const errors: Record<string, string> = {
  access_revoked:
    "Le compte d’exécution ou un responsable a perdu ses droits. Corrigez les accès puis relancez.",
  invalid_action:
    "Une action n’est plus valide. Vérifiez l’étape, la liste, les dates et les responsables.",
  record_changed:
    "La fiche a changé depuis votre demande. Examinez les nouvelles données puis préparez une nouvelle exécution.",
  worker_failed:
    "Le traitement a échoué après plusieurs tentatives. Réessayez après avoir corrigé la cause.",
  capacity:
    "200 exécutions sont déjà en attente dans cet espace. Libérez la file puis créez un nouvel aperçu.",
  delivery_uncertain:
    "Le résultat de l’envoi est incertain. Vérifiez chez le fournisseur, puis confirmez ci-dessous si l’action a eu lieu. Aucun renvoi automatique.",
  calendar_write_permission:
    "Reconnectez le calendrier dans Intégrations pour autoriser la création d’événements, puis réessayez.",
  ai_not_configured: "La clé du fournisseur IA n’est pas configurée sur le worker.",
  ai_provider_rate_limited:
    "Le fournisseur IA limite les demandes. Attendez avant de préparer une nouvelle exécution.",
  provider_rejected:
    "Le fournisseur a refusé l’action. Vérifiez ses permissions et les valeurs configurées.",
  external_not_ready:
    "Une connexion ou une variable manque. Vérifiez le bloc et le compte d’exécution.",
  wait_timeout: "La condition attendue ne s’est pas produite avant le délai maximal.",
  criteria_changed:
    "La fiche ne remplit plus les critères d’entrée. Les actions restantes ont été arrêtées.",
};
const pending = ["queued", "running", "waiting"];
export function WorkflowHistory({
  workflows,
  workflowId = "",
  onFilter,
  onControl,
  focusId,
}: {
  focusId?: string;
  workflows: Workflow[];
  workflowId?: string;
  onFilter: (id: string) => void;
  onControl: (
    row: Workflow,
    action: "retry" | "cancel" | "resolve_done" | "resolve_not_sent",
    execution: string,
  ) => Promise<void>;
}) {
  const { workspace, objects, user } = useWorkspace();
  const [page, setPage] = useState(0),
    [status, setStatus] = useState(""),
    [focused, setFocused] = useState<string | null>(focusId ?? null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["workflow-history", workspace.id, workflowId, status, page],
    queryFn: () =>
      request<{ data: Execution[]; count: number }>(
        `/api/${workspace.id}/automation?` +
          new URLSearchParams({ workflow: workflowId, status, page: String(page) }),
      ),
    refetchInterval: 15000,
  });
  const detail = useQuery({
    queryKey: ["workflow-history", workspace.id, "detail", focused],
    enabled: !!focused,
    queryFn: () =>
      request<{ data: Execution[]; definition: WorkflowDefinition; steps: StepRun[] }>(
        `/api/${workspace.id}/automation?id=${focused}`,
      ),
    refetchInterval: (query) =>
      pending.includes(query.state.data?.data[0]?.status ?? "") ? 2000 : false,
  });
  const run = detail.data?.data[0];
  const siblings = useQuery({
    queryKey: ["workflow-history", workspace.id, "run-list", run?.workflow_id],
    enabled: !!run,
    queryFn: () =>
      request<{ data: Execution[]; count: number }>(
        `/api/${workspace.id}/automation?` +
          new URLSearchParams({ workflow: run!.workflow_id, page: "0" }),
      ),
    refetchInterval: pending.includes(run?.status ?? "") ? 5000 : false,
  });
  const flowLookup = useQuery({
    queryKey: ["workflow-history-flow", workspace.id, run?.workflow_id],
    enabled: !!run && !workflows.some((w) => w.id === run.workflow_id),
    queryFn: () =>
      request<{ data: Workflow[] }>(`/api/${workspace.id}/workflows?id=${run!.workflow_id}&size=1`),
  });
  const flow = workflows.find((w) => w.id === run?.workflow_id) ?? flowLookup.data?.data[0];
  const canControl =
    !!flow &&
    (flow.created_by == null ||
      flow.created_by === user.id ||
      ["owner", "admin"].includes(workspace.role));
  async function control(action: "retry" | "cancel" | "resolve_done" | "resolve_not_sent") {
    if (
      !run ||
      !flow ||
      !window.confirm(
        action === "resolve_done"
          ? "Confirmer que cette action a bien eu lieu chez le fournisseur ? Elle ne sera pas renvoyée."
          : action === "resolve_not_sent"
            ? "Confirmer après vérification que cette action n’a PAS eu lieu ? Cela autorise un nouvel envoi réel."
            : action === "cancel"
              ? "Arrêter les actions restantes ? Les actions déjà réalisées seront conservées."
              : "Reprendre à partir du dernier point enregistré ? Les actions déjà réalisées ne seront pas rejouées.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await onControl(flow, action, run.id);
      await Promise.all([q.refetch(), detail.refetch()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select
            aria-label="Filtrer l’historique par workflow"
            value={workflowId}
            onChange={(e) => {
              onFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Tous les workflows</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
            {workflowId && !workflows.some((w) => w.id === workflowId) && (
              <option value={workflowId}>Workflow sélectionné</option>
            )}
          </select>
          <select
            aria-label="Filtrer par résultat"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Tous les résultats</option>
            {Object.entries(workflowStatuses).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button className="button small" disabled={q.isFetching} onClick={() => q.refetch()}>
          <RefreshCw size={14} />
          Actualiser
        </button>
      </div>
      <ErrorMessage error={q.error} />
      <div className={styles.historyTable}>
        <table>
          <thead>
            <tr>
              <th>Fiche et workflow</th>
              <th>Déclenchement</th>
              <th>Résultat</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data?.data.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.record_name}</strong>
                  <small>
                    {workflows.find((w) => w.id === r.workflow_id)?.name ?? "Workflow"} · v
                    {r.workflow_version}
                  </small>
                </td>
                <td>{workflowTriggers[r.source]}</td>
                <td>
                  <State value={r.status} />
                </td>
                <td>{new Date(r.created_at).toLocaleString("fr-FR")}</td>
                <td>
                  <button
                    className="button small"
                    onClick={() => {
                      setFocused(r.id);
                      setError("");
                    }}
                  >
                    Voir les étapes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {q.isPending ? (
          <p className={styles.emptyHistory}>Chargement de l’historique…</p>
        ) : (
          q.data?.data.length === 0 && (
            <p className={styles.emptyHistory}>
              Aucune exécution pour ces filtres. Publiez un workflow ou confirmez un aperçu pour
              commencer.
            </p>
          )
        )}
      </div>
      <Pagination
        page={page}
        size={25}
        total={q.data?.count ?? 0}
        busy={q.isFetching}
        onChange={setPage}
      />
      {focused && (
        <Modal
          open
          wide
          className={`${styles.root} ${styles.runViewer}`}
          title={flow?.name ?? "Exécutions du workflow"}
          description="Chaque action réalisée reste visible, même si le workflow est modifié ensuite."
          onClose={() => {
            if (!busy) setFocused(null);
          }}
        >
          <ErrorMessage error={detail.error} />
          {detail.isPending && <p>Chargement…</p>}
          {!detail.isPending && !detail.error && !run && (
            <p>Cette exécution n’est plus disponible.</p>
          )}
          {run && (
            <div className={styles.runDetail}>
              <div className={styles.runSummary}>
                <div>
                  <strong>{run.record_name}</strong>
                  <small>
                    Version {run.workflow_version} · {workflowTriggers[run.source]}
                  </small>
                </div>
                <State value={run.status} />
                <Link
                  className="button small"
                  href={`/app/${workspaceRecordPage(run.record_object_id)}?focus=${run.record_id}`}
                >
                  <ExternalLink size={13} />
                  Ouvrir la fiche
                </Link>
              </div>
              {run.error_code && (
                <p className={styles.help}>
                  {errors[run.error_code] ??
                    "Consultez les droits et la configuration du workflow avant de réessayer."}
                </p>
              )}
              {run.next_at && pending.includes(run.status) && (
                <p className={styles.help}>
                  <Clock3 size={14} /> Reprise prévue le{" "}
                  {new Date(run.next_at).toLocaleString("fr-FR")}. Les critères seront vérifiés à
                  nouveau.
                </p>
              )}
              {detail.data?.definition || (detail.data?.steps?.length ?? 0) > 0 ? (
                <ExecutionCanvas
                  key={run.id}
                  definition={detail.data?.definition}
                  steps={detail.data?.steps ?? []}
                  runStatus={run.status}
                  runList={
                    <div className={styles.runList}>
                      <div className={styles.inspectorHeading}>
                        <span>HISTORIQUE DU WORKFLOW</span>
                        <h3>{flow?.name ?? "Exécutions"}</h3>
                        <p>{siblings.data?.count ?? 0} exécution(s) · 25 dernières</p>
                      </div>
                      <ErrorMessage error={siblings.error} />
                      {siblings.isPending && <p className="caption">Chargement des exécutions…</p>}
                      {(siblings.data?.data ?? []).map((item) => (
                        <button
                          type="button"
                          className={styles.runListItem}
                          key={item.id}
                          aria-pressed={item.id === run.id}
                          disabled={busy}
                          onClick={() => {
                            setFocused(item.id);
                            setError("");
                          }}
                        >
                          <span>
                            <strong>{item.record_name}</strong>
                            <small>
                              {new Date(item.created_at).toLocaleString("fr-FR")} · v
                              {item.workflow_version}
                            </small>
                          </span>
                          <State value={item.status} />
                        </button>
                      ))}
                      <button
                        type="button"
                        className="button small"
                        onClick={() => {
                          onFilter(run.workflow_id);
                          setPage(0);
                          setFocused(null);
                        }}
                      >
                        Toutes les exécutions
                      </button>
                    </div>
                  }
                />
              ) : (
                <ol className={styles.trace}>
                  {run.trace.map((step, i) => (
                    <li key={i}>
                      <div>
                        <strong>{step.title}</strong>
                        <small>{new Date(step.at).toLocaleString("fr-FR")}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {error && <div className="alert error">{error}</div>}
              {canControl && (
                <div className="dialog-footer">
                  {["queued", "waiting", "paused", "failed", "unknown"].includes(run.status) && (
                    <button className="button" disabled={busy} onClick={() => control("cancel")}>
                      <X size={14} />
                      Arrêter la suite
                    </button>
                  )}
                  {run.status === "unknown" && (
                    <>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => control("resolve_done")}
                      >
                        Action déjà réalisée
                      </button>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => control("resolve_not_sent")}
                      >
                        Confirmé non envoyé · réessayer
                      </button>
                    </>
                  )}
                  {run.status === "failed" && run.error_code !== "capacity" && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => control("retry")}
                    >
                      <RefreshCw size={14} />
                      Réessayer
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
  function workspaceRecordPage(id?: string) {
    const object = objects.find((o) => o.id === id);
    return object ? (object.standard ? object.slug : "object-" + object.slug) : "companies";
  }
}
export function State({ value }: { value: string }) {
  return (
    <span className={styles.state} data-state={value}>
      <i />
      {workflowStatuses[value] ??
        ({ active: "Active", draft: "Brouillon", paused: "En pause" } as Record<string, string>)[
          value
        ] ??
        value}
    </span>
  );
}
