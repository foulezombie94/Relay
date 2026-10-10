"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  CalendarDays,
  Mic,
  Plus,
  Search,
  Star,
  SlidersHorizontal,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Link2,
  LockKeyhole,
  FileText,
  RefreshCw,
} from "lucide-react";
import { useWorkspace } from "../providers/data-provider";
import { Empty, ErrorMessage, Loading } from "../ui";
import { Pagination } from "../ui/pagination";
import { RecordPicker } from "../records/picker";
import { request } from "@/lib/api/request";
import {
  meetingLibrarySchema,
  meetingDayBounds,
  meetingDate,
  type MeetingListItem,
} from "@/lib/domain/meetings";
import { MeetingEditor } from "./editor";
import { MeetingDetails, CalendarDetails } from "./details";
import { InsightTemplates } from "./templates";
import styles from "./meetings.module.css";
import { meetingTabKeys } from "./keyboard-tabs";

export function MeetingsPage() {
  const { workspace } = useWorkspace();
  return <MeetingWorkspace key={workspace.id} />;
}
function MeetingWorkspace() {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const params = useSearchParams();
  const [tab, setTab] = useState("calls"),
    [search, setSearch] = useState(""),
    [term, setTerm] = useState("");
  const [page, setPage] = useState(0),
    [provider, setProvider] = useState("all"),
    [sort, setSort] = useState("recent"),
    [favorites, setFavorites] = useState(false),
    [grouped, setGrouped] = useState(true),
    [settings, setSettings] = useState(false),
    [participant, setParticipant] = useState(""),
    [record, setRecord] = useState("");
  const [selected, setSelected] = useState<{ id: string; kind: "meeting" | "calendar" } | null>(
      null,
    ),
    [dismissed, setDismissed] = useState(false),
    [creating, setCreating] = useState(false),
    [actionError, setActionError] = useState<Error | null>(null),
    [starBusy, setStarBusy] = useState<string | null>(null);
  const [day, setDay] = useState(() =>
      new Date().toLocaleDateString("en-CA", { timeZone: workspace.timezone }),
    ),
    [allDates, setAllDates] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const bounds = tab === "agenda" && !allDates ? meetingDayBounds(day, workspace.timezone) : {};
  const filters = {
    view: tab === "agenda" ? "agenda" : "calls",
    q: term,
    page,
    provider,
    sort,
    favorite: favorites ? "only" : "all",
    participant,
    ...(record ? { record } : {}),
    ...bounds,
  };
  const query = useQuery({
    queryKey: ["rows", workspace.id, "meeting-library", filters],
    enabled: tab !== "templates",
    queryFn: async () =>
      meetingLibrarySchema.parse(
        await request(
          `/api/${workspace.id}/meetings/library?` +
            new URLSearchParams(Object.entries(filters).map(([k, v]) => [k, String(v)])),
        ),
      ),
    retry: false,
  });
  const data = !query.isError ? query.data : undefined;
  const focus = z.uuid().safeParse(params.get("focus"));
  const chosen =
    selected ?? (!dismissed && focus.success ? { id: focus.data, kind: "meeting" as const } : null);
  async function favorite(item: MeetingListItem) {
    setStarBusy(item.id);
    setActionError(null);
    try {
      const result = await request(`/api/${workspace.id}/meetings/${item.id}/favorite`, "PUT", {
        favorite: !item.favorite,
      });
      if (result.ok !== true || result.id !== item.id)
        throw new Error("La modification du favori n’a pas été confirmée.");
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id, "meeting-library"] });
    } catch (error) {
      setActionError(error as Error);
    } finally {
      setStarBusy(null);
    }
  }
  function selectTab(value: string) {
    setTab(value);
    setSort(value === "agenda" ? "oldest" : "recent");
    setPage(0);
    setFavorites(false);
  }
  function changeDay(amount: number) {
    const d = new Date(day + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + amount);
    setDay(d.toISOString().slice(0, 10));
    setAllDates(false);
    setPage(0);
  }
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>VOTRE MÉMOIRE CLIENT</span>
          <h1>
            Réunions{" "}
            <span className={styles.headingBadge}>
              <Mic size={13} /> Call intelligence
            </span>
          </h1>
          <p>Préparez vos échanges. Retrouvez les décisions. Faites avancer la suite.</p>
        </div>
        <div className={styles.actions}>
          <Link href={`/app/integrations?workspace=${workspace.id}`} className="button">
            <Link2 size={14} />
            Connecter un calendrier
          </Link>
          <button
            className="button primary"
            disabled={workspace.role === "viewer"}
            onClick={() => setCreating(true)}
          >
            <Plus size={15} />
            Ajouter une réunion
          </button>
        </div>
      </header>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Bibliothèque de réunions"
        onKeyDown={meetingTabKeys}
      >
        {[
          ["agenda", "Agenda", CalendarDays],
          ["calls", "Appels & transcriptions", Mic],
          ["templates", "Modèles d’analyse", FileText],
        ].map(([value, label, Icon]) => (
          <button
            key={String(value)}
            role="tab"
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            aria-controls="meeting-tab-panel"
            id={`meeting-tab-${value}`}
            onClick={() => selectTab(String(value))}
          >
            {typeof Icon !== "string" && <Icon size={16} />}
            <span>{String(label)}</span>
          </button>
        ))}
      </div>
      <section id="meeting-tab-panel" role="tabpanel" aria-labelledby={`meeting-tab-${tab}`}>
        {tab === "templates" ? (
          <InsightTemplates />
        ) : (
          <>
            <div className={styles.toolbar}>
              <label className={styles.search}>
                <Search size={16} />
                <input
                  aria-label="Rechercher une réunion"
                  placeholder="Rechercher un titre ou un résumé…"
                  maxLength={200}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className={styles.actions}>
                {tab === "calls" && (
                  <button
                    className="button"
                    aria-pressed={favorites}
                    onClick={() => {
                      setFavorites(!favorites);
                      setPage(0);
                    }}
                  >
                    <Star size={14} />
                    Favoris
                  </button>
                )}
                <button
                  className="button"
                  aria-expanded={settings}
                  onClick={() => setSettings(!settings)}
                >
                  <SlidersHorizontal size={14} />
                  Filtres & vue
                </button>
                <button
                  className="icon-button"
                  aria-label="Actualiser les réunions"
                  onClick={() => void query.refetch()}
                  disabled={query.isFetching}
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>
            {settings && (
              <div className={styles.filters}>
                <label>
                  Source
                  <select
                    value={provider}
                    onChange={(e) => {
                      setProvider(e.target.value);
                      setPage(0);
                    }}
                  >
                    {[
                      ["all", "Toutes les sources"],
                      ["import", "Ajout manuel"],
                      ["google-meet", "Google Meet"],
                      ["microsoft-teams", "Microsoft Teams"],
                      ["zoom", "Zoom"],
                      ["google-calendar", "Google Calendar"],
                      ["outlook-calendar", "Outlook Calendar"],
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Trier par
                  <select
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="recent">Plus récentes</option>
                    <option value="oldest">Plus anciennes</option>
                  </select>
                </label>
                <label>
                  Participant
                  <input
                    placeholder="Email ou « me »"
                    maxLength={254}
                    value={participant}
                    onChange={(e) => {
                      setParticipant(e.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <div>
                  <span>Fiche CRM</span>
                  <RecordPicker
                    name="meeting_filter_record"
                    initial={record}
                    onChange={(id) => {
                      setRecord(id);
                      setPage(0);
                    }}
                  />
                </div>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={grouped}
                    onChange={(e) => setGrouped(e.target.checked)}
                  />
                  Regrouper par date
                </label>
              </div>
            )}
            {tab === "agenda" && (
              <div className={styles.dayNavigation}>
                <button
                  className="icon-button"
                  aria-label="Jour précédent"
                  onClick={() => changeDay(-1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <label>
                  Date de l’agenda
                  <input
                    type="date"
                    value={day}
                    onChange={(e) => {
                      if (e.target.value) {
                        setDay(e.target.value);
                        setAllDates(false);
                        setPage(0);
                      }
                    }}
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label="Jour suivant"
                  onClick={() => changeDay(1)}
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  className="button small"
                  onClick={() => {
                    setDay(
                      new Date().toLocaleDateString("en-CA", { timeZone: workspace.timezone }),
                    );
                    setAllDates(false);
                    setPage(0);
                  }}
                >
                  Aujourd’hui
                </button>
                <button
                  className="button small"
                  aria-pressed={allDates}
                  onClick={() => {
                    setAllDates(!allDates);
                    setPage(0);
                  }}
                >
                  Toutes les dates
                </button>
              </div>
            )}
            <ErrorMessage error={query.error} />
            <ErrorMessage error={actionError} />
            {query.isPending ? (
              <Loading />
            ) : (
              data && (
                <>
                  <div className={styles.listHeading}>
                    <span>
                      {data.count} {tab === "agenda" ? "rendez-vous" : "appel"}
                      {data.count > 1 && tab !== "agenda" ? "s" : ""}
                    </span>
                    <span>{workspace.timezone} · Vos accès sont respectés</span>
                  </div>
                  {!data.data.length ? (
                    <Empty
                      title={
                        favorites ? "Aucun favori" : "Votre prochaine conversation commence ici"
                      }
                      description={
                        term || provider !== "all" || record || participant
                          ? "Aucune réunion ne correspond à ces filtres."
                          : tab === "agenda"
                            ? "Connectez Google Calendar ou Outlook, ou ajoutez votre premier rendez-vous."
                            : "Importez une transcription ou connectez Meet, Teams ou Zoom pour retrouver vos échanges."
                      }
                      action={
                        <button
                          className="button"
                          disabled={workspace.role === "viewer"}
                          onClick={() => setCreating(true)}
                        >
                          <Plus size={15} />
                          Ajouter une réunion
                        </button>
                      }
                    />
                  ) : (
                    <div className={styles.library}>
                      {data.data.map((item, index) => {
                        const group = meetingDate(
                          item.starts_at ?? item.created_at,
                          workspace.timezone,
                        );
                        const previous = data.data[index - 1];
                        const show =
                          grouped &&
                          (!previous ||
                            group !==
                              meetingDate(
                                previous.starts_at ?? previous.created_at,
                                workspace.timezone,
                              ));
                        return (
                          <div key={item.kind + item.id}>
                            {show && <h2 className={styles.dateGroup}>{group}</h2>}
                            <article className={styles.meetingRow}>
                              {item.kind === "meeting" ? (
                                <button
                                  className={styles.star}
                                  aria-label={`${item.favorite ? "Retirer" : "Ajouter"} ${item.title} ${item.favorite ? "des" : "aux"} favoris`}
                                  aria-pressed={item.favorite}
                                  disabled={starBusy === item.id}
                                  onClick={() => void favorite(item)}
                                >
                                  <Star size={17} fill={item.favorite ? "currentColor" : "none"} />
                                </button>
                              ) : (
                                <span className={styles.star}>
                                  <CalendarDays size={17} />
                                </span>
                              )}
                              <button
                                className={styles.rowOpen}
                                onClick={() => setSelected({ id: item.id, kind: item.kind })}
                              >
                                <span className={styles.rowIcon}>
                                  {item.has_transcript ? (
                                    <Mic size={19} />
                                  ) : (
                                    <CalendarDays size={19} />
                                  )}
                                </span>
                                <span className={styles.rowContent}>
                                  <strong>{item.title || "Réunion sans titre"}</strong>
                                  <small>
                                    {meetingDate(item.starts_at, workspace.timezone, true)} ·{" "}
                                    {providerName(item.provider)}
                                    {item.record && ` · ${item.record.display_name}`}
                                  </small>
                                  {item.summary && (
                                    <span className={styles.summaryPreview}>{item.summary}</span>
                                  )}
                                </span>
                                <span className={styles.participants}>
                                  {item.participants.slice(0, 3).map((p, i) => (
                                    <span title={p.name} key={i}>
                                      {p.name.slice(0, 1).toUpperCase()}
                                    </span>
                                  ))}
                                </span>
                                <span className={styles.rowBadges}>
                                  {item.private && (
                                    <span title="Privée">
                                      <LockKeyhole size={12} />
                                    </span>
                                  )}
                                  <span>
                                    {item.status === "cancelled"
                                      ? "Annulée"
                                      : item.has_transcript
                                        ? "Transcrite"
                                        : item.status === "scheduled"
                                          ? "Planifiée"
                                          : "Terminée"}
                                  </span>
                                </span>
                                <ArrowUpRight size={15} />
                              </button>
                            </article>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Pagination
                    page={page}
                    size={25}
                    total={data.count}
                    busy={query.isFetching}
                    onChange={setPage}
                  />
                </>
              )
            )}
            <aside className={styles.importNote}>
              <Mic size={19} />
              <div>
                <strong>Du rendez-vous aux prochaines étapes</strong>
                <p>
                  Vos imports Meet, Teams et Zoom restent privés. Ajoutez une transcription pour
                  l’analyser et retrouver ses passages. Les enregistrements dépendent de votre
                  fournisseur et de votre abonnement.
                </p>
              </div>
              <Link className="button small" href={`/app/integrations?workspace=${workspace.id}`}>
                Gérer les intégrations <ArrowUpRight size={13} />
              </Link>
            </aside>
          </>
        )}
      </section>
      {creating && (
        <MeetingEditor
          onClose={() => setCreating(false)}
          onSaved={(row) => {
            selectTab(
              row.transcript || row.summary || row.status === "completed" ? "calls" : "agenda",
            );
            setAllDates(true);
          }}
        />
      )}
      {chosen?.kind === "meeting" && (
        <MeetingDetails
          key={chosen.id}
          id={chosen.id}
          onClose={() => {
            setSelected(null);
            setDismissed(true);
          }}
        />
      )}
      {chosen?.kind === "calendar" && (
        <CalendarDetails
          key={chosen.id}
          id={chosen.id}
          onClose={() => {
            setSelected(null);
            setDismissed(true);
          }}
        />
      )}
    </main>
  );
}
export function providerName(provider: string) {
  return (
    (
      {
        import: "Ajout manuel",
        "google-meet": "Google Meet",
        "microsoft-teams": "Microsoft Teams",
        zoom: "Zoom",
        "google-calendar": "Google Calendar",
        "outlook-calendar": "Outlook Calendar",
      } as Record<string, string>
    )[provider] ?? provider
  );
}
