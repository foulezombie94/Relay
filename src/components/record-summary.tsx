"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  CircleUserRound,
  Layers3,
  ArrowRight,
  CheckCheck,
  Mail,
  Globe,
} from "lucide-react";
import { request, useWorkspace } from "./data-provider";
import { Badge, date, money, str } from "./ui";
import type { RecordContext } from "./record-context";
import type { CrmRecord } from "@/lib/domain/types";
import styles from "./pages/records.module.css";

export function RecordSummary({
  record,
  onTasks,
  onCommitments,
  onRelations,
}: {
  record: CrmRecord;
  onTasks: () => void;
  onCommitments: () => void;
  onRelations: () => void;
}) {
  const { workspace, objects } = useWorkspace();
  const object = objects.find((item) => item.id === record.object_id);
  const slug = object?.slug;
  const isDeal = slug === "deals";
  const Icon =
    slug === "people"
      ? CircleUserRound
      : slug === "companies"
        ? Building2
        : Layers3;
  const q = useQuery({
    queryKey: ["rows", workspace.id, "context", record.id],
    queryFn: () =>
      request<RecordContext>(
        "/api/" + workspace.id + "/context?record_id=" + record.id,
      ),
  });
  const related = (q.data?.related ?? []).filter(
    (item) => !item.archived && !item.merged_into,
  );
  const upcoming = (q.data?.timeline ?? [])
    .filter(
      (item) =>
        ["tasks", "commitments"].includes(item.resource) &&
        !["done", "cancelled"].includes(str(item.status)),
    )
    .sort((a, b) => {
      const aDate = a.due_date ? Date.parse(str(a.due_date)) : Infinity;
      const bDate = b.due_date ? Date.parse(str(b.due_date)) : Infinity;
      return (
        (Number.isFinite(aDate) ? aDate : Infinity) -
        (Number.isFinite(bDate) ? bDate : Infinity)
      );
    })[0];
  return (
    <div className={styles.summary}>
      <div className={styles.summaryIdentity}>
        <span
          className={`${styles.pageIcon} ${slug === "people" ? styles.roundIcon : ""}`}
        >
          <Icon size={25} />
        </span>
        <div>
          <small>
            {isDeal
              ? "OPPORTUNITÉ"
              : slug === "people"
                ? "CONTACT"
                : slug === "companies"
                  ? "COMPTE ENTREPRISE"
                  : "FICHE"}
          </small>
          <h2>{record.display_name}</h2>
        </div>
      </div>
      {isDeal && (
        <div className={styles.summaryDeal}>
          <strong>{money(record.amount, record.currency || "EUR")}</strong>
          <Badge value={record.stage} />
          {record.close_date && (
            <span>
              <CalendarDays size={14} /> Clôture le {date(record.close_date)}
            </span>
          )}
        </div>
      )}
      <div className={styles.summaryContacts}>
        {record.email && (
          <span>
            <Mail size={14} />
            {record.email}
          </span>
        )}
        {record.domain && (
          <span>
            <Globe size={14} />
            {record.domain}
          </span>
        )}
        {!record.email && !record.domain && !isDeal && (
          <span>Coordonnées à compléter</span>
        )}
      </div>
      {q.data && (
        <div className={styles.relationPreview}>
          <div>
            <strong>
              {slug === "people"
                ? "Relations professionnelles"
                : isDeal
                  ? "Parties prenantes"
                  : "Contacts et opportunités liés"}
            </strong>
            <button type="button" onClick={onRelations}>
              Gérer les relations <ArrowRight size={12} />
            </button>
          </div>
          <div>
            {related.slice(0, 4).map((item) => {
              const target = objects.find(
                (candidate) => candidate.id === item.object_id,
              );
              return target ? (
                <Link
                  key={item.id}
                  href={
                    "/app/" +
                    (target.standard ? target.slug : "object-" + target.slug) +
                    "?record=" +
                    item.id
                  }
                >
                  {target.slug === "companies" ? (
                    <Building2 size={12} />
                  ) : target.slug === "people" ? (
                    <CircleUserRound size={12} />
                  ) : (
                    <Layers3 size={12} />
                  )}
                  {item.display_name}
                </Link>
              ) : null;
            })}
            {!related.length && (
              <span>Aucune fiche reliée pour le moment.</span>
            )}
          </div>
        </div>
      )}
      {q.data && (
        <div className={styles.nextStep}>
          <span>
            <CheckCheck size={16} />{" "}
            {q.data.truncated
              ? "ACTION À SUIVRE · APERÇU LIMITÉ"
              : "PROCHAINE ACTION"}
          </span>
          {upcoming ? (
            <>
              <strong>{str(upcoming.title)}</strong>
              <div>
                {upcoming.due_date ? date(upcoming.due_date) : "Sans échéance"}
                <button
                  type="button"
                  onClick={
                    upcoming.resource === "tasks" ? onTasks : onCommitments
                  }
                >
                  Voir le contexte <ArrowRight size={12} />
                </button>
              </div>
            </>
          ) : (
            <>
              <p>Aucune action ouverte dans cet aperçu.</p>
              <button type="button" onClick={onTasks}>
                Définir une prochaine action <ArrowRight size={12} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
