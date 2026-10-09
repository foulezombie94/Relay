"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useWorkspace, request } from "../providers/data-provider";
type Status = {
  id: string;
  status: string;
  attempts: number;
  result: Record<string, unknown> | null;
  error: string | null;
};
export function BackgroundJob({
  id,
  onComplete,
}: {
  id: string;
  onComplete: (result: Record<string, unknown>) => void;
}) {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const delivered = useRef<string | null>(null);
  const query = useQuery({
    queryKey: ["job", workspace.id, id],
    queryFn: () => request<{ data: Status }>("/api/" + workspace.id + "/jobs/" + id),
    refetchInterval: (q) =>
      ["completed", "dead"].includes(q.state.data?.data.status ?? "") ? false : 2000,
  });
  const job = query.data?.data;
  useEffect(() => {
    if (job?.status === "completed" && delivered.current !== id) {
      delivered.current = id;
      void cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
      onComplete(job.result ?? {});
    }
  }, [job, id, cache, workspace.id, onComplete]);
  if (query.error)
    return (
      <div className="alert error">
        Le suivi est indisponible. Le traitement continue ; réessayez en rouvrant cette page.
      </div>
    );
  if (job?.status === "dead")
    return (
      <div className="alert error" role="alert">
        {job.error}
      </div>
    );
  return (
    <div className="alert info" role="status">
      {job?.status === "completed"
        ? "Traitement terminé."
        : job?.status === "running"
          ? "Traitement en cours…"
          : "Traitement en attente. Vous pouvez continuer à utiliser Relay."}
    </div>
  );
}
