"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace, useSave, request } from "../providers/data-provider";
import { PageHeader, Empty, Loading, ErrorMessage, Editor, Badge, date, Avatar } from "../ui";
import { RecordDetails } from "./record-details";
import type { Priority } from "@/lib/domain/priorities";
import type { CrmRecord } from "@/lib/domain/types";
export function PrioritiesPage() {
  const router = useRouter();
  const { workspace, user, objects } = useWorkspace();
  const [mine, setMine] = useState(false);
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<CrmRecord | null>(null);
  const [action, setAction] = useState<CrmRecord | null>(null);
  const { save, busy } = useSave();
  const q = useQuery({
    queryKey: ["rows", workspace.id, "priorities", mine, offset],
    staleTime: 15_000,
    queryFn: () =>
      request<{
        data: Priority[];
        generated_at: string;
        total: number;
        without_next_action: number;
        next_offset: number | null;
        matching: number;
      }>("/api/" + workspace.id + "/priorities?offset=" + offset + (mine ? "&owner=me" : "")),
  });
  const rows = q.data?.data ?? [];
  return (
    <>
      <PageHeader
        title="À traiter"
        description="Les prochaines actions, classées par raisons concrètes."
        action={
          <button className="button" onClick={() => q.refetch()} disabled={q.isFetching}>
            Actualiser
          </button>
        }
      />
      <div className="toolbar">
        <label className="inline-check">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => {
              setMine(e.target.checked);
              setOffset(0);
            }}
          />
          Mes fiches uniquement
        </label>
        <span className="pill">{q.data?.total ?? 0} fiches analysées</span>
        {q.data && <small>Calcul du {new Date(q.data.generated_at).toLocaleString("fr-FR")}</small>}
      </div>
      <div className="alert info">
        L’indice mesure l’urgence opérationnelle, pas une probabilité de vente. Chaque raison et son
        poids sont visibles. Un suivi daté dans les 7 prochains jours évite l’alerte d’inactivité.
      </div>
      <ErrorMessage error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : q.error ? null : rows.length === 0 ? (
        <Empty
          title="Aucune alerte dans ce périmètre"
          description="Vos fiches n’ont pas de signal d’urgence selon les règles affichées."
        />
      ) : (
        <div className="stack">
          {rows.map((p) => (
            <article className="detail-card priority-card" key={p.record.id}>
              <div className="card-head">
                <button className="plain-button name-cell" onClick={() => setDetail(p.record)}>
                  <Avatar name={p.record.display_name} />
                  <strong>{p.record.display_name}</strong>
                </button>
                <div className="row-actions">
                  <span className={"priority-score " + (p.score >= 60 ? "urgent" : "")}>
                    {p.score}/100
                  </span>
                  <Badge value={p.record.stage} />
                </div>
              </div>
              <ul className="signal-list">
                {p.signals.map((s) => (
                  <li key={s.code}>
                    <a href={"/app/" + s.resource}>{s.label}</a>
                    <small>+{s.weight}</small>
                  </li>
                ))}
              </ul>
              <div className="card-head">
                <small>
                  Prochaine tâche :{" "}
                  {p.next_task
                    ? String(p.next_task.title) + " · " + date(p.next_task.due_date)
                    : "Non planifiée"}
                </small>
                <button
                  className="button small"
                  disabled={workspace.role === "viewer"}
                  onClick={() => setAction(p.record)}
                >
                  Planifier une action
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {!q.error && q.data && (offset > 0 || q.data.next_offset !== null) && (
        <div className="toolbar">
          <button
            className="button"
            disabled={offset === 0 || q.isFetching}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Précédent
          </button>
          <small>
            {offset + 1}–{offset + rows.length} sur {q.data.matching} priorités
          </small>
          <button
            className="button"
            disabled={q.data.next_offset === null || q.isFetching}
            onClick={() => setOffset(q.data!.next_offset!)}
          >
            Suivant
          </button>
        </div>
      )}
      {action && (
        <Editor
          open
          onClose={() => setAction(null)}
          title={"Prochaine action · " + action.display_name}
          busy={busy}
          initial={{ owner_id: action.owner_id || user.id, priority: "normal" }}
          fields={[
            { key: "title", label: "Action", required: true },
            {
              key: "due_date",
              label: "Date et heure",
              type: "datetime-local",
              required: true,
            },
          ]}
          onSave={(v) =>
            save("tasks", {
              ...v,
              record_id: action.id,
              owner_id: action.owner_id || user.id,
              status: "open",
            })
          }
        />
      )}{" "}
      {detail && (
        <RecordDetails
          record={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDetail(null);
            router.push(
              "/app/" +
                (objects.find((o) => o.id === detail.object_id)?.standard
                  ? objects.find((o) => o.id === detail.object_id)?.slug
                  : "object-" + objects.find((o) => o.id === detail.object_id)?.slug),
            );
          }}
        />
      )}
    </>
  );
}
