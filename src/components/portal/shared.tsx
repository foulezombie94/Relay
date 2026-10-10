"use client";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  FileText,
  LockKeyhole,
  RefreshCw,
  CheckCircle2,
  Circle,
  Megaphone,
  ListChecks,
  MessageSquare,
  CircleHelp,
} from "lucide-react";
import {
  portalDate,
  portalProgress,
  portalStatusLabels,
  type PortalItem,
  type PortalSummary,
} from "@/lib/domain/portals";
import styles from "./portal.module.css";
export function PortalHeader({ back = false, manage }: { back?: boolean; manage?: string | null }) {
  return (
    <header className={styles.topbar}>
      <Link href="/portal" className={styles.brand}>
        <span>Z</span>
        <strong>Zyliad</strong>
        <small>Espace client</small>
      </Link>
      <nav>
        {back && (
          <Link href="/portal">
            <ArrowLeft size={14} />
            Mes portails
          </Link>
        )}
        {manage && (
          <Link href={manage}>
            Mon CRM
            <ArrowUpRight size={14} />
          </Link>
        )}
        <Link href="/doc">
          <CircleHelp size={15} />
          Aide
        </Link>
        <span className={styles.private}>
          <LockKeyhole size={12} />
          Accès privé
        </span>
      </nav>
    </header>
  );
}
export function PortalLoading() {
  return (
    <div className={styles.loading} role="status" aria-label="Chargement du portail">
      <span />
      <span />
      <span />
      <p>Chargement de vos informations…</p>
    </div>
  );
}
export function PortalError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <h2>Impossible d’ouvrir cet espace</h2>
      <p>{error.message}</p>
      <button className="button" onClick={retry}>
        <RefreshCw size={14} />
        Réessayer
      </button>
      <Link href="/portal">Retour à mes portails</Link>
    </div>
  );
}
export function Progress({
  summary,
  compact = false,
}: {
  summary: Pick<PortalSummary, "step_count" | "completed_steps">;
  compact?: boolean;
}) {
  const progress = portalProgress(summary);
  return (
    <div className={styles.progress} data-compact={compact}>
      <div>
        <span>
          {summary.step_count
            ? `${summary.completed_steps} sur ${summary.step_count} étapes terminées`
            : "Aucune étape partagée"}
        </span>
        {progress !== null && <strong>{progress} %</strong>}
      </div>
      <div
        className={styles.progressTrack}
        role={progress !== null ? "progressbar" : undefined}
        aria-label="Avancement des étapes"
        aria-valuenow={progress ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: (progress ?? 0) + "%" }} />
      </div>
    </div>
  );
}
export const itemIcons = {
  update: Megaphone,
  step: ListChecks,
  decision: MessageSquare,
  document: FileText,
};
export function SharedItem({ item, portalId }: { item: PortalItem; portalId: string }) {
  const Icon = itemIcons[item.type];
  const label = Object.hasOwn(portalStatusLabels, item.status)
    ? portalStatusLabels[item.status]
    : "Partagé";
  return (
    <article className={styles.sharedItem}>
      <span className={styles.itemIcon}>
        <Icon size={18} />
      </span>
      <div className={styles.itemBody}>
        <div className={styles.itemHeading}>
          <h3>{item.title}</h3>
          <span className={styles.status} data-done={["done", "approved"].includes(item.status)}>
            {["done", "approved"].includes(item.status) ? (
              <CheckCircle2 size={12} />
            ) : (
              <Circle size={10} />
            )}
            {label}
          </span>
        </div>
        {item.content && <p>{item.content}</p>}
        <footer>
          {item.due_date && (
            <span>
              <CalendarDays size={12} />
              Échéance : {portalDate(item.due_date)}
            </span>
          )}
          <span>Partagé le {portalDate(item.created_at)}</span>
          {item.document_id && (
            <a
              className={styles.documentLink}
              href={"/api/portal/" + portalId + "?document=" + item.document_id}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText size={13} />
              Ouvrir le document
              <ArrowUpRight size={12} />
            </a>
          )}
        </footer>
      </div>
    </article>
  );
}
export function PortalPagination({
  page,
  count,
  size,
  onPage,
  label,
}: {
  page: number;
  count: number;
  size: number;
  onPage: (page: number) => void;
  label: string;
}) {
  return (
    <div className={styles.pagination}>
      <span>
        {count ? `${page * size + 1}–${Math.min((page + 1) * size, count)} sur ${count}` : "0"}{" "}
        {label}
      </span>
      <div>
        <button className="button small" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Précédent
        </button>
        <button
          className="button small"
          disabled={(page + 1) * size >= count}
          onClick={() => onPage(page + 1)}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
