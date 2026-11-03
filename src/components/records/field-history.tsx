"use client";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, History } from "lucide-react";
import { request, useRows, useWorkspace } from "../providers/data-provider";
import { ErrorMessage, Loading, str } from "../ui";
import {
  fieldLabel,
  groupChanges,
  historyValue,
  type FieldChange,
} from "@/lib/domain/record-history";
import { stageLabel, type Pipeline } from "@/lib/domain/pipelines";
import type { Attribute, CrmRecord } from "@/lib/domain/types";
import styles from "./field-history.module.css";

const fieldOptions = [
  "display_name",
  "email",
  "domain",
  "stage",
  "amount",
  "owner_id",
  "close_date",
  "pipeline_id",
  "probability",
  "lost_reason",
  "archived",
];
function relative(at: string) {
  const diff = (Date.now() - new Date(at).getTime()) / 1000;
  if (diff < 60) return "à l’instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return new Date(at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

/** Attio-style field history: who changed which value, from what, to what. */
export function FieldHistory({ record }: { record: CrmRecord }) {
  const { workspace } = useWorkspace();
  const [field, setField] = useState("");
  const members = useRows("memberships", { size: 100 });
  const attrs = useRows<Attribute>("attributes", { object_id: record.object_id, size: 100 });
  const pipelines = useRows<Pipeline>("pipelines", { size: 100 });
  const q = useInfiniteQuery({
    queryKey: ["rows", workspace.id, "record-history", record.id, field],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ record: record.id, size: "60" });
      if (field) params.set("field", field);
      if (pageParam) params.set("before", pageParam);
      return request<{ data: FieldChange[] }>(`/api/${workspace.id}/record-history?${params}`);
    },
    getNextPageParam: (last) => (last.data.length >= 60 ? last.data.at(-1)?.at : undefined),
  });
  const attributes = attrs.data?.data ?? [];
  const memberNames = new Map(
    (members.data?.data ?? []).map((m) => [str(m.user_id), str(m.display_name) || "Membre"]),
  );
  const pipelineRows = pipelines.data?.data ?? [];
  const pipeline = pipelineRows.find((p) => p.id === record.pipeline_id);
  function display(change: FieldChange, value: unknown) {
    return historyValue(value, (text) => {
      if (change.field === "owner_id") return memberNames.get(text) ?? "Membre retiré";
      if (change.field === "pipeline_id")
        return pipelineRows.find((p) => p.id === text)?.name ?? "Pipeline supprimé";
      if (change.field === "stage") return stageLabel(pipeline, text);
      if (change.field === "archived") return text === "true" ? "Supprimée" : "Restaurée";
      if (change.field === "amount") return Number(text).toLocaleString("fr-FR");
      if (change.field === "close_date")
        return new Date(text + "T12:00:00").toLocaleDateString("fr-FR");
      return undefined;
    });
  }
  // A page boundary can split one event: grouping runs on the concatenated list.
  const changes = (q.data?.pages ?? []).flatMap((page) => page.data);
  const seen = new Set<string>();
  const unique = changes.filter((change) => {
    const key = change.event_id + ":" + change.field;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const groups = groupChanges(unique);
  return (
    <section className={styles.history} aria-label="Historique des modifications">
      <header className={styles.header}>
        <div>
          <h3>
            <History size={16} /> Modifications
          </h3>
          <p>Chaque changement de valeur, avec son auteur et sa date.</p>
        </div>
        <select
          aria-label="Filtrer par propriété"
          value={field}
          onChange={(event) => setField(event.target.value)}
        >
          <option value="">Toutes les propriétés</option>
          {fieldOptions.map((key) => (
            <option key={key} value={key}>
              {fieldLabel(key)}
            </option>
          ))}
          {attributes
            .filter((a) => !a.archived && a.type !== "formula")
            .map((a) => (
              <option key={a.key} value={"attributes." + a.key}>
                {a.name}
              </option>
            ))}
        </select>
      </header>
      <ErrorMessage error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : !groups.length ? (
        <p className={styles.empty}>Aucune modification enregistrée pour cette propriété.</p>
      ) : (
        <ol className={styles.timeline}>
          {groups.map((group) => (
            <li key={group.event_id} className={styles.event}>
              <span className={styles.avatar} aria-hidden>
                {group.actor.slice(0, 1).toUpperCase()}
              </span>
              <div className={styles.body}>
                <div className={styles.meta}>
                  <strong>{group.actor}</strong>
                  <span>
                    {group.action === "insert" ? "a créé la fiche" : "a modifié"} ·{" "}
                    <time dateTime={group.at} title={new Date(group.at).toLocaleString("fr-FR")}>
                      {relative(group.at)}
                    </time>
                  </span>
                </div>
                <ul className={styles.changes}>
                  {group.items.map((change) => (
                    <li key={change.field}>
                      <span className={styles.field}>{fieldLabel(change.field, attributes)}</span>
                      {group.action !== "insert" && (
                        <>
                          <span className={styles.before}>{display(change, change.before)}</span>
                          <ArrowRight size={13} aria-label="devient" />
                        </>
                      )}
                      <span className={styles.after}>{display(change, change.after)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      )}
      {q.hasNextPage && (
        <button
          className="button small"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        >
          {q.isFetchingNextPage ? "Chargement…" : "Afficher les modifications plus anciennes"}
        </button>
      )}
    </section>
  );
}
