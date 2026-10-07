"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { request, useSave, useWorkspace } from "./data-provider";
import { Modal, Loading, ErrorMessage, Empty, Badge, date, str } from "./ui";
import type { CrmRecord, Row } from "@/lib/domain/types";
export type RecordContext = {
  record: CrmRecord & { merged_into?: string | null };
  relations: Row[];
  related: CrmRecord[];
  timeline: (Row & { resource: string })[];
  counts: Record<string, number>;
  truncated: boolean;
  relation_count: number;
};
export function useRecordContext(recordId: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["rows", workspace.id, "context", recordId],
    staleTime: 30_000,
    queryFn: () =>
      request<RecordContext>(
        "/api/" + workspace.id + "/context?record_id=" + recordId,
      ),
  });
}
const labels: Record<string, string> = {
  notes: "Note",
  tasks: "Tâche",
  commitments: "Engagement",
  activities: "Activité",
  meetings: "Réunion",
  documents: "Document",
  conflicts: "Contradiction",
};
export function RecordContextPanel({
  record,
  mode,
}: {
  record: CrmRecord;
  mode: "timeline" | "relations";
}) {
  const { workspace, objects } = useWorkspace();
  const router = useRouter();
  const { save, remove, busy } = useSave();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const q = useRecordContext(record.id);
  const candidates = useQuery({
    queryKey: ["rows", workspace.id, "record-relation-candidates", search],
    enabled: adding,
    queryFn: () =>
      request<{ data: CrmRecord[] }>(
        "/api/" +
          workspace.id +
          "/records?size=25&q=" +
          encodeURIComponent(search),
      ),
  });
  function go(r: CrmRecord) {
    const o = objects.find((o) => o.id === r.object_id);
    if (o)
      router.push(
        "/app/" +
          (o.standard ? o.slug : "object-" + o.slug) +
          "?record=" +
          r.id,
      );
  }
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorMessage error={q.error} />;
  const data = q.data!;
  return (
    <>
      {data.record.merged_into && (
        <div className="alert info">
          Cette fiche a été fusionnée.{" "}
          <a
            href={
              "/app/" +
              (objects.find((o) => o.id === record.object_id)?.standard
                ? objects.find((o) => o.id === record.object_id)?.slug
                : "object-" +
                  objects.find((o) => o.id === record.object_id)?.slug) +
              "?record=" +
              data.record.merged_into
            }
          >
            Ouvrir la fiche conservée
          </a>
        </div>
      )}
      {data.truncated && (
        <div className="alert info">
          Aperçu limité aux 100 derniers éléments de chaque catégorie et aux 100
          premières relations. Consultez leurs pages pour la suite.
        </div>
      )}
      {mode === "timeline" ? (
        <>
          <div className="context-counts">
            {Object.entries(data.counts)
              .filter(([, count]) => count > 0)
              .map(([key, count]) => (
                <span className="pill" key={key}>
                  {labels[key]} · {count}
                </span>
              ))}
          </div>
          <div className="timeline">
            {data.timeline.map((r) => (
              <article className="timeline-item" key={r.resource + ":" + r.id}>
                <div className="card-head">
                  <span className="pill">{labels[r.resource]}</span>
                  <small>{date(r.created_at)}</small>
                </div>
                <strong>{str(r.title || r.name || r.type)}</strong>
                {r.private === true && (
                  <span className="pill">Privée · vous uniquement</span>
                )}
                {r.status ? <Badge value={r.status} /> : null}
                <p className="preserve-lines">
                  {str(
                    r.content || r.description || r.summary || r.source_quote,
                  ).slice(0, 1500)}
                </p>
                {r.due_date ? (
                  <small>Échéance : {date(r.due_date)}</small>
                ) : null}
                {r.starts_at ? (
                  <small>Réunion : {date(r.starts_at)}</small>
                ) : null}
                {r.resource === "documents" && (
                  <a
                    className="button small"
                    target="_blank"
                    rel="noreferrer"
                    href={"/api/" + workspace.id + "/files?id=" + r.id}
                  >
                    Ouvrir
                  </a>
                )}
                {r.resource !== "documents" && (
                  <a className="text-link" href={"/app/" + r.resource}>
                    Voir et gérer les {labels[r.resource]?.toLowerCase()}s
                  </a>
                )}
              </article>
            ))}
            {!data.timeline.length && (
              <Empty
                title="Le contexte commence ici"
                description="Les notes, actions, réunions et documents liés à cette fiche apparaîtront ensemble."
              />
            )}
          </div>
        </>
      ) : (
        <>
          <div className="card-head">
            <p>{data.relation_count} relation(s)</p>
            <button
              className="button small"
              disabled={
                workspace.role === "viewer" || !!data.record.merged_into
              }
              onClick={() => {
                setError("");
                setAdding(true);
              }}
            >
              Relier une fiche
            </button>
          </div>
          <div className="stack">
            {data.relations.map((r) => {
              const other = data.related.find(
                (v) =>
                  v.id ===
                  (r.source_id === record.id ? r.target_id : r.source_id),
              );
              return (
                <article className="detail-card" key={r.id}>
                  <div className="card-head">
                    <button
                      className="plain-button"
                      disabled={!other}
                      onClick={() => other && go(other)}
                    >
                      <strong>
                        {other?.display_name || "Fiche inaccessible"}
                      </strong>
                    </button>
                    <button
                      className="button small"
                      disabled={workspace.role === "viewer"}
                      onClick={() =>
                        void remove("record_relations", r.id).catch(() => {})
                      }
                    >
                      Dissocier
                    </button>
                  </div>
                  <p>
                    {str(r.label)} ·{" "}
                    {r.source_id === record.id
                      ? "relation sortante"
                      : "relation entrante"}
                    {other?.archived ? " · archivée" : ""}
                  </p>
                </article>
              );
            })}
            {!data.relations.length && (
              <Empty
                title="Aucune fiche liée"
                description="Reliez les personnes, entreprises et opportunités qui travaillent ensemble."
              />
            )}
          </div>
        </>
      )}
      {adding && (
        <Modal open onClose={() => setAdding(false)} title="Relier une fiche">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const form = new FormData(e.currentTarget);
              try {
                await save("record_relations", {
                  source_id: record.id,
                  target_id: String(form.get("target_id")),
                  label: String(form.get("label")),
                });
                setAdding(false);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Relation impossible",
                );
              }
            }}
          >
            <label>
              Rechercher une fiche
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, email ou domaine"
              />
            </label>
            <ErrorMessage error={candidates.error} />
            <label>
              Fiche à relier
              <select name="target_id" required>
                <option value="">Choisir…</option>
                {candidates.data?.data
                  .filter((r) => r.id !== record.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.display_name} ·{" "}
                      {objects.find((o) => o.id === r.object_id)?.name}
                    </option>
                  ))}
              </select>
              <small>
                25 résultats à la fois. Affinez la recherche si nécessaire.
              </small>
            </label>
            <label>
              Relation
              <input
                name="label"
                required
                maxLength={300}
                placeholder="Décideur, travaille chez, partenaire…"
              />
            </label>
            {error && <div className="alert error">{error}</div>}
            <div className="dialog-footer">
              <button
                className="button"
                type="button"
                onClick={() => setAdding(false)}
              >
                Annuler
              </button>
              <button
                className="button primary"
                disabled={busy || candidates.isPending}
              >
                Relier
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
