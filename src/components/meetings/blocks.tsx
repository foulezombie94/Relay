import type { ReactNode } from "react";
import { ArrowUpRight, CalendarDays, FileText, LockKeyhole, Mic, Star } from "lucide-react";
import type { MeetingListItem } from "@/lib/domain/meetings";
import { meetingDate } from "@/lib/domain/meetings";
import styles from "./meetings.module.css";

export function MeetingPageIntro({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={styles.cover} aria-hidden="true">
        <div className={styles.coverLines} />
        <div className={styles.coverPaper}>
          <CalendarDays size={30} strokeWidth={1.2} />
          <span />
          <span />
          <span />
        </div>
        <div className={styles.coverNote}>
          <Mic size={22} strokeWidth={1.3} />
          <span />
          <span />
        </div>
        <div className={styles.coverCircle} />
      </div>
      <header className={styles.heading}>
        <div className={styles.pageTitle}>
          <span className={styles.pageIcon} aria-hidden="true">
            <CalendarDays size={31} strokeWidth={1.5} />
          </span>
          <span className={styles.eyebrow}>ESPACE DE RÉUNIONS</span>
          <h1>Réunions</h1>
          <p>Préparez vos échanges et gardez leurs décisions à portée de main.</p>
        </div>
        <div className={styles.actions}>{children}</div>
      </header>
    </>
  );
}

export function MeetingCallout({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <aside className={styles.callout}>
      <span className={styles.calloutIcon} aria-hidden="true">
        {icon}
      </span>
      <div>
        <strong>{title}</strong>
        <div className={styles.calloutText}>{children}</div>
      </div>
      {action && <div className={styles.calloutAction}>{action}</div>}
    </aside>
  );
}

export function MeetingEmpty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.emptyBlock}>
      <div className={styles.emptyDocument} aria-hidden="true">
        <FileText size={32} strokeWidth={1.2} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
      <small>Un espace pour préparer, comprendre et suivre vos échanges.</small>
    </div>
  );
}

export function MeetingLibraryItem({
  item,
  timezone,
  providerLabel,
  busy,
  onFavorite,
  onOpen,
}: {
  item: MeetingListItem;
  timezone: string;
  providerLabel: string;
  busy: boolean;
  onFavorite: () => void;
  onOpen: () => void;
}) {
  const state =
    item.status === "cancelled"
      ? "cancelled"
      : item.has_transcript
        ? "transcribed"
        : item.status === "scheduled"
          ? "scheduled"
          : "completed";
  const label = {
    cancelled: "Annulée",
    transcribed: "Transcrite",
    scheduled: "Planifiée",
    completed: "Terminée",
  }[state];
  return (
    <article className={styles.meetingRow} data-status={state}>
      {item.kind === "meeting" ? (
        <button
          className={styles.star}
          aria-label={`${item.favorite ? "Retirer" : "Ajouter"} ${item.title} ${item.favorite ? "des" : "aux"} favoris`}
          aria-pressed={item.favorite}
          disabled={busy}
          onClick={onFavorite}
        >
          <Star size={15} fill={item.favorite ? "currentColor" : "none"} />
        </button>
      ) : (
        <span className={styles.star} aria-hidden="true">
          <CalendarDays size={15} />
        </span>
      )}
      <button className={styles.rowOpen} onClick={onOpen}>
        <span className={styles.rowIcon} aria-hidden="true">
          {item.has_transcript ? (
            <FileText size={20} strokeWidth={1.5} />
          ) : (
            <CalendarDays size={20} strokeWidth={1.5} />
          )}
        </span>
        <span className={styles.rowContent}>
          <strong>{item.title || "Réunion sans titre"}</strong>
          <span className={styles.rowProperties}>
            <small>
              <CalendarDays size={11} />
              {meetingDate(item.starts_at, timezone, true)}
            </small>
            <small className={styles.sourceTag}>{providerLabel}</small>
            {item.record && <small className={styles.recordTag}>{item.record.display_name}</small>}
          </span>
          <span className={styles.summaryPreview}>
            {item.summary ||
              (item.has_transcript
                ? "Ouvrir la transcription et les analyses"
                : "Retrouver les informations de la réunion")}
          </span>
        </span>
        <span className={styles.rowFooter}>
          <span className={styles.participants}>
            {item.participants.slice(0, 3).map((p, i) => (
              <span title={p.name} key={i}>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            {item.participants.length > 3 && (
              <span title={`${item.participants.length} participants`}>
                +{item.participants.length - 3}
              </span>
            )}
          </span>
          <span className={styles.rowBadges}>
            {item.private && (
              <span title="Privée">
                <LockKeyhole size={12} />
              </span>
            )}
            <span className={styles.statusTag} data-status={state}>
              <i aria-hidden="true" />
              {label}
            </span>
          </span>
        </span>
        <ArrowUpRight className={styles.rowArrow} size={15} aria-hidden="true" />
      </button>
    </article>
  );
}
