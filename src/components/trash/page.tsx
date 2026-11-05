"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw, Search, Trash2, Building2, Users, Layers3, Box } from "lucide-react";
import { request, useRows, useWorkspace } from "../providers/data-provider";
import { PageHeader, Modal, ErrorMessage, Loading, Empty, str } from "../ui";
import { Pagination } from "../ui/pagination";
import styles from "./trash.module.css";

type TrashRow = {
  id: string;
  object_id: string;
  display_name: string;
  email: string | null;
  domain: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};
const retentionDays = 30;
const icons: Record<string, typeof Box> = {
  companies: Building2,
  people: Users,
  deals: Layers3,
};
export function daysLeft(deletedAt: string | null, now = Date.now()) {
  if (!deletedAt) return retentionDays;
  const elapsed = Math.floor((now - new Date(deletedAt).getTime()) / 86400000);
  return Math.max(0, retentionDays - elapsed);
}

export function TrashPage() {
  const { workspace, objects } = useWorkspace();
  const cache = useQueryClient();
  const [objectId, setObjectId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purging, setPurging] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const admin = ["owner", "admin"].includes(workspace.role);
  const writer = workspace.role !== "viewer";
  const members = useRows("memberships", { size: 100 });
  const names = new Map(
    (members.data?.data ?? []).map((m) => [str(m.user_id), str(m.display_name) || "Membre"]),
  );
  const params = new URLSearchParams({ page: String(page), size: "50" });
  if (objectId) params.set("object_id", objectId);
  if (search.trim()) params.set("q", search.trim());
  const q = useQuery({
    queryKey: ["rows", workspace.id, "trash", objectId, search, page],
    queryFn: () =>
      request<{ data: TrashRow[]; count: number }>(`/api/${workspace.id}/trash?${params}`),
  });
  const rows = q.data?.data ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  async function act(action: "restore" | "purge", ids: string[]) {
    setBusy(true);
    try {
      if (action === "restore") {
        const result = await request<{ restored: number }>(`/api/${workspace.id}/trash`, "POST", {
          action,
          ids,
        });
        toast.success(`${result.restored} fiche(s) restaurée(s)`);
      } else {
        const result = await request<{ purged: number; kept: number }>(
          `/api/${workspace.id}/trash`,
          "POST",
          { action, ids, confirm },
        );
        toast.success(
          result.kept
            ? `${result.purged} supprimée(s) · ${result.kept} conservée(s) car liées à des preuves (documents, engagements, réunions…)`
            : `${result.purged} fiche(s) supprimée(s) définitivement`,
        );
        setPurging(null);
        setConfirm("");
      }
      setSelected(new Set());
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Corbeille"
        description={`Les fiches supprimées restent restaurables pendant ${retentionDays} jours, puis sont effacées automatiquement.`}
      />
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Type de fiche">
          <button
            role="tab"
            aria-selected={!objectId}
            onClick={() => {
              setObjectId("");
              setPage(0);
            }}
          >
            Toutes
          </button>
          {objects.map((object) => (
            <button
              key={object.id}
              role="tab"
              aria-selected={objectId === object.id}
              onClick={() => {
                setObjectId(object.id);
                setPage(0);
              }}
            >
              {object.name}
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Search size={14} />
          <input
            aria-label="Rechercher dans la corbeille"
            placeholder="Rechercher"
            value={search}
            maxLength={200}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      {selected.size > 0 && (
        <div className={styles.bulk} role="region" aria-label="Actions groupées">
          <span>{selected.size} sélectionnée(s)</span>
          <button
            className="button small"
            disabled={!writer || busy}
            onClick={() => act("restore", [...selected])}
          >
            <RotateCcw size={14} /> Restaurer
          </button>
          {admin && (
            <button
              className="button small danger"
              disabled={busy}
              onClick={() => setPurging([...selected])}
            >
              <Trash2 size={14} /> Supprimer définitivement
            </button>
          )}
          <button className={styles.link} onClick={() => setSelected(new Set())}>
            Désélectionner
          </button>
        </div>
      )}
      <ErrorMessage error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : !rows.length ? (
        <Empty
          title={search || objectId ? "Aucune fiche trouvée" : "La corbeille est vide"}
          description="Une fiche supprimée apparaît ici avec son auteur et sa date d’effacement."
        />
      ) : (
        <div className={styles.table} role="table" aria-label="Fiches supprimées">
          <div className={styles.head} role="row">
            <span role="columnheader">
              <input
                type="checkbox"
                aria-label="Tout sélectionner"
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))
                }
              />
            </span>
            <span role="columnheader">Nom</span>
            <span role="columnheader">Supprimée par</span>
            <span role="columnheader">Supprimée le</span>
            <span role="columnheader">Effacement</span>
            <span role="columnheader" className={styles.actionsHead}>
              Actions
            </span>
          </div>
          {rows.map((row) => {
            const object = objects.find((o) => o.id === row.object_id);
            const Icon = icons[object?.slug ?? ""] ?? Box;
            const left = daysLeft(row.deleted_at);
            return (
              <div
                className={styles.row}
                role="row"
                key={row.id}
                data-selected={selected.has(row.id)}
              >
                <span role="cell">
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner ${row.display_name}`}
                    checked={selected.has(row.id)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                  />
                </span>
                <span role="cell" className={styles.name}>
                  <Icon size={15} aria-hidden />
                  <span>
                    <strong>{row.display_name}</strong>
                    <small>
                      {object?.name ?? "Fiche"}
                      {row.email ? " · " + row.email : row.domain ? " · " + row.domain : ""}
                    </small>
                  </span>
                </span>
                <span role="cell">
                  {row.deleted_by ? (names.get(row.deleted_by) ?? "Membre retiré") : "—"}
                </span>
                <span role="cell">
                  {row.deleted_at
                    ? new Date(row.deleted_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </span>
                <span role="cell">
                  <span className={styles.expiry} data-soon={left <= 7}>
                    {left === 0 ? "Imminent" : `${left} j`}
                  </span>
                </span>
                <span role="cell" className={styles.actions}>
                  <button
                    className="button small"
                    disabled={!writer || busy}
                    onClick={() => act("restore", [row.id])}
                  >
                    <RotateCcw size={14} /> Restaurer
                  </button>
                  {admin && (
                    <button
                      className="icon-button"
                      aria-label={`Supprimer définitivement ${row.display_name}`}
                      disabled={busy}
                      onClick={() => setPurging([row.id])}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {(q.data?.count ?? 0) > 50 && (
        <Pagination
          page={page}
          size={50}
          total={q.data?.count ?? 0}
          busy={q.isFetching}
          onChange={setPage}
        />
      )}
      {purging && (
        <Modal
          open
          onClose={() => {
            setPurging(null);
            setConfirm("");
          }}
          title="Suppression définitive"
          description="Cette action est irréversible. Les tâches et notes liées sont aussi effacées ; les fiches liées à des preuves (documents, engagements, réunions) restent dans la corbeille."
        >
          <form
            className={styles.confirm}
            onSubmit={(event) => {
              event.preventDefault();
              void act("purge", purging);
            }}
          >
            <label>
              Saisissez <strong>SUPPRIMER</strong> pour effacer {purging.length} fiche(s)
              <input
                autoFocus
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="dialog-footer">
              <button type="button" className="button" onClick={() => setPurging(null)}>
                Annuler
              </button>
              <button className="button danger" disabled={busy || confirm !== "SUPPRIMER"}>
                Supprimer définitivement
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
