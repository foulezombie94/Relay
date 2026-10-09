"use client";
import { useState } from "react";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { request, useWorkspace } from "../providers/data-provider";
import { Modal, ErrorMessage, Empty, Loading, date } from "../ui";
import { Pagination } from "../ui/pagination";
type Notice = {
  id: string;
  entity: "tasks" | "commitments" | "workflows";
  entity_id: string;
  kind: "assigned" | "due";
  title: string;
  due_date: string | null;
  read_at: string | null;
};
export function Notifications({ embedded = false }: { embedded?: boolean } = {}) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [unread, setUnread] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const q = useQuery({
    queryKey: ["notifications", workspace.id, page, unread],
    queryFn: () =>
      request<{ data: Notice[]; count: number; unread: number }>(
        "/api/" + workspace.id + "/notifications?page=" + page + "&unread=" + unread,
      ),
    refetchInterval: 60000,
  });
  async function mark(id?: string) {
    setBusy(true);
    setError(null);
    try {
      await request(
        "/api/" + workspace.id + "/notifications",
        "PATCH",
        id ? { id } : { all: true },
      );
      await q.refetch();
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Action impossible"));
    } finally {
      setBusy(false);
    }
  }
  const inbox = (
    <div className="stack">
      <div className="toolbar">
        <label>
          <input
            type="checkbox"
            checked={unread}
            onChange={(e) => {
              setUnread(e.target.checked);
              setPage(0);
            }}
          />{" "}
          Non lues uniquement
        </label>
        <button
          className="button small"
          disabled={busy || !q.data?.unread}
          onClick={() => void mark()}
        >
          Tout marquer comme lu
        </button>
      </div>
      <ErrorMessage error={q.error || error} />
      {q.isPending ? (
        <Loading />
      ) : (
        q.data?.data.map((n) => (
          <article key={n.id} className="detail-card">
            <strong>{n.kind === "assigned" ? "Nouvelle attribution" : "Échéance à suivre"}</strong>
            <p>{n.title}</p>
            <small>
              {date(n.due_date)}
              {n.read_at ? " · Lu" : ""}
            </small>
            <div className="card-actions">
              <Link
                className="button small"
                href={"/app/" + n.entity + "?focus=" + n.entity_id}
                onClick={() => {
                  void mark(n.id);
                  setOpen(false);
                }}
              >
                Ouvrir
              </Link>
              {!n.read_at && (
                <button className="button small" disabled={busy} onClick={() => void mark(n.id)}>
                  Marquer comme lu
                </button>
              )}
            </div>
          </article>
        ))
      )}
      {q.data?.count === 0 && <Empty title="Aucune notification" />}
      <Pagination
        page={page}
        size={20}
        total={q.data?.count ?? 0}
        onChange={setPage}
        busy={q.isFetching}
      />
      <p className="caption">
        Vos tâches et engagements attribués. Un rappel apparaît dans les 24 heures avant l’échéance
        ; les échéances dépassées restent à traiter. Actualisation chaque minute.
      </p>
    </div>
  );
  if (embedded) return inbox;
  return (
    <>
      <button
        type="button"
        className="button small"
        style={{ marginLeft: "auto" }}
        onClick={() => setOpen(true)}
        aria-label={"Notifications · " + (q.data?.unread ?? 0) + " non lues"}
      >
        <Bell size={16} />
        {(q.data?.unread ?? 0) > 0 && <span>{q.data?.unread}</span>}
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Vos notifications">
          {inbox}
        </Modal>
      )}
    </>
  );
}
