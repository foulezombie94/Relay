"use client";
import { isTerminalStage } from "@/lib/domain/pipelines";
import { useRef, useState, useEffect } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  CalendarDays,
  Circle,
  CheckCircle2,
  FileText,
  Building2,
  Mail,
  Video,
} from "lucide-react";
import { calendarCells, entryDate } from "@/lib/domain/dashboard-widgets";
import {
  formatDashboardValue,
  type DashboardEntry,
  type DashboardEntries,
  type ReportTile,
} from "@/lib/domain/dashboards";
import styles from "./dashboard.module.css";
import boardStyles from "./board.module.css";

export type EntryPageRequest = (options: {
  cursor: string | null;
  month?: string;
}) => Promise<DashboardEntries>;
const statusLabels: Record<string, string> = {
  open: "À faire",
  in_progress: "En cours",
  done: "Terminé",
  cancelled: "Annulé",
  proposed: "Proposé",
  confirmed: "Confirmé",
  postponed: "Reporté",
};
const dateLabel = (entry: DashboardEntry) =>
  entryDate(entry)?.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }) ?? "Sans date";
const statusLabel = (value: string | null) =>
  value && Object.hasOwn(statusLabels, value) ? statusLabels[value] : undefined;
export function RecordWidget({
  tile,
  initial,
  onRequest,
  onOpen,
}: {
  tile: ReportTile;
  initial: DashboardEntries;
  onRequest?: EntryPageRequest;
  onOpen: (entry: DashboardEntry) => void;
}) {
  const [page, setPage] = useState(initial),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("date_desc");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current++;
    },
    [],
  );
  async function load(cursor: string | null, month = page.month) {
    if (!onRequest) return;
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      const next = await onRequest({ cursor, month });
      if (requestId.current === id) setPage(next);
    } catch (e) {
      if (requestId.current === id)
        setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      if (requestId.current === id) setBusy(false);
    }
  }
  const rows = error
    ? []
    : [...page.data]
        .filter((entry) =>
          entry.title.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")),
        )
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title, "fr")
            : ((entryDate(a)?.getTime() ?? 0) - (entryDate(b)?.getTime() ?? 0)) *
              (sort === "date_desc" ? -1 : 1),
        );
  const open = (entry: DashboardEntry) => (
    <button
      className={styles.entryButton}
      onClick={() => onOpen(entry)}
      title={"Ouvrir " + entry.title}
    >
      {entry.status === "done" ? (
        <CheckCircle2 size={15} className={styles.doneIcon} />
      ) : tile.kind === "task" ? (
        <Circle size={15} />
      ) : (
        <FileText size={15} />
      )}
      <span>
        <strong>{entry.title || "Sans titre"}</strong>
        <small>{statusLabel(entry.status) ?? entry.stage ?? dateLabel(entry)}</small>
      </span>
      {entry.currency && entry.amount !== null && (
        <b>{formatDashboardValue(entry.amount, "amount", entry.currency)}</b>
      )}
      <ArrowUpRight size={13} className={styles.entryArrow} />
    </button>
  );
  const month = page.month ?? new Date().toISOString().slice(0, 7);
  const year = Number(month.slice(0, 4)),
    monthIndex = Number(month.slice(5, 7)) - 1;
  const label = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const shift = (amount: number) =>
    void load(null, new Date(Date.UTC(year, monthIndex + amount, 1)).toISOString().slice(0, 7));
  const grouped = new Map<string, DashboardEntry[]>();
  for (const entry of rows) {
    const key =
      tile.visual === "board"
        ? (entry.stage ?? entry.status ?? "Sans statut")
        : (entryDate(entry)?.toISOString().slice(0, 10) ?? "Sans date");
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  if (tile.visual === "board") {
    const stages =
      tile.kind === "record" ? ["Gagné", "Perdu"] : ["open", "in_progress", "done", "cancelled"];
    for (const stage of stages) if (!grouped.has(stage)) grouped.set(stage, []);
  }
  return (
    <div className={styles.recordView} aria-busy={busy}>
      <div className={styles.viewToolbar}>
        <label className={styles.viewSearch}>
          <Search size={13} />
          <input
            aria-label={"Rechercher dans " + tile.title}
            placeholder="Rechercher dans cette page…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label={"Trier " + tile.title}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="date_desc">Date ↓</option>
          <option value="date_asc">Date ↑</option>
          <option value="title">Nom A–Z</option>
        </select>
      </div>
      {error && (
        <div role="alert" className={styles.warning}>
          {error}
          <button className={styles.textButton} onClick={() => void load(null)}>
            Réessayer
          </button>
        </div>
      )}
      {busy && (
        <p role="status" className={styles.muted}>
          Chargement des fiches autorisées…
        </p>
      )}
      {tile.visual === "calendar" ? (
        <>
          <div className={styles.calendarHeader}>
            <span>
              <CalendarDays size={14} />
              {label}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Mois précédent"
                disabled={busy || !onRequest}
                onClick={() => shift(-1)}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className="icon-button"
                aria-label="Mois suivant"
                disabled={busy || !onRequest}
                onClick={() => shift(1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className={styles.calendarWeek}>
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className={styles.calendarGrid}>
            {calendarCells(year, monthIndex).map((date) => {
              const key = date.toISOString().slice(0, 10);
              const dayRows = rows.filter(
                (entry) => entryDate(entry)?.toISOString().slice(0, 10) === key,
              );
              return (
                <div
                  key={key}
                  data-outside={date.getUTCMonth() !== monthIndex}
                  data-today={key === new Date().toISOString().slice(0, 10)}
                >
                  <span>{date.getUTCDate()}</span>
                  {dayRows.map((entry) => (
                    <button key={entry.id} title={entry.title} onClick={() => onOpen(entry)}>
                      {entry.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          <small className={styles.muted}>
            Dates en UTC · les fiches sans date restent dans la vue Liste.
          </small>
        </>
      ) : tile.visual === "board" ? (
        <div className={styles.board}>
          {[...grouped]
            .sort(([a], [b]) => {
              const order =
                tile.kind === "record"
                  ? ["Nouveau", "Qualification", "Proposition", "Négociation", "Gagné", "Perdu"]
                  : [
                      "proposed",
                      "confirmed",
                      "open",
                      "in_progress",
                      "done",
                      "postponed",
                      "cancelled",
                    ];
              // Custom pipeline stages sort after default open stages, before Gagné/Perdu.
              const rank = (value: string) =>
                order.includes(value)
                  ? order.indexOf(value) +
                    (tile.kind === "record" && isTerminalStage(value) ? 2 : 0)
                  : tile.kind === "record"
                    ? 4.5
                    : order.length;
              return rank(a) - rank(b) || a.localeCompare(b);
            })
            .map(([group, entries]) => (
              <section key={group}>
                <h4>
                  <i />
                  {statusLabel(group) ?? group}
                  <span>{entries.length}</span>
                </h4>
                {entries.map((entry) => (
                  <div key={entry.id} className={styles.boardCard}>
                    {open(entry)}
                  </div>
                ))}
                {!entries.length && (
                  <p className={styles.boardEmpty}>Aucune fiche sur cette page</p>
                )}
              </section>
            ))}
        </div>
      ) : tile.visual === "timeline" ? (
        <div className={styles.timeline}>
          {[...grouped].map(([day, entries]) => (
            <section key={day}>
              <h4>
                <i />
                {day === "Sans date"
                  ? day
                  : new Date(day + "T00:00:00Z").toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
              </h4>
              {entries.map((entry) => (
                <div key={entry.id}>{open(entry)}</div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className={tile.visual === "gallery" ? boardStyles.gallery : styles.entryList}>
          {rows.map((entry, index) => (
            <div key={entry.id}>
              {tile.visual === "gallery" ? (
                <button
                  className={boardStyles.galleryCard}
                  onClick={() => onOpen(entry)}
                  title={"Ouvrir " + entry.title}
                >
                  <span
                    className={boardStyles.galleryCover}
                    data-tone={index % 6}
                    aria-hidden="true"
                  >
                    {tile.kind === "record" ? (
                      <>
                        <Building2 size={18} />
                        <b>
                          {(entry.title || "Sans titre")
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((word) => word[0])
                            .join("")
                            .toLocaleUpperCase("fr")}
                        </b>
                      </>
                    ) : tile.kind === "email" ? (
                      <Mail size={36} />
                    ) : tile.kind === "meeting" ? (
                      <Video size={36} />
                    ) : (
                      <CheckCircle2 size={36} />
                    )}
                    <ArrowUpRight size={15} className={boardStyles.galleryOpen} />
                  </span>
                  <strong>{entry.title || "Sans titre"}</strong>
                  <span className={boardStyles.galleryMeta}>
                    {statusLabel(entry.status) ?? entry.stage ?? dateLabel(entry)}
                  </span>
                  <span className={boardStyles.galleryAmount}>
                    {entry.currency && entry.amount !== null
                      ? formatDashboardValue(entry.amount, "amount", entry.currency)
                      : dateLabel(entry)}
                  </span>
                </button>
              ) : (
                open(entry)
              )}
            </div>
          ))}
        </div>
      )}
      {!rows.length && tile.visual !== "calendar" && (
        <p className={styles.empty}>
          {query
            ? "Aucune fiche ne correspond à cette recherche."
            : "Aucune fiche pour ces filtres."}
        </p>
      )}
      <div className={styles.recordFooter}>
        <span>
          {rows.length} affichées · {page.total} sources{page.partial ? " · aperçu paginé" : ""}
        </span>
        <div>
          <button
            className={styles.textButton}
            disabled={busy || !onRequest}
            onClick={() => void load(null)}
          >
            Début
          </button>
          <button
            className={styles.textButton}
            disabled={busy || !onRequest || !page.next_cursor || !!error}
            onClick={() => void load(page.next_cursor)}
          >
            Suivante <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
