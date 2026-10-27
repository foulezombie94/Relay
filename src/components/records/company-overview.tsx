"use client";
import { useState } from "react";
import {
  Building2,
  CircleDollarSign,
  CalendarDays,
  CheckSquare,
  Layers3,
  Globe,
  Mail,
  FileText,
  Activity,
} from "lucide-react";
import type { CrmRecord, ObjectDefinition, Row } from "@/lib/domain/types";
import { relatedRecords, nextRecordAction } from "@/lib/domain/record-profile";
import type { RecordContext } from "./context";
import { Avatar, date, str } from "../ui/display";
import styles from "./company-overview.module.css";

export function CompanyOverview({
  record,
  context,
  objects,
  onTab,
}: {
  record: CrmRecord;
  context: RecordContext;
  objects: ObjectDefinition[];
  onTab: (tab: string) => void;
}) {
  const [now] = useState(() => Date.now());
  const deals = relatedRecords(context.related, objects, "deals");
  const meetings = context.timeline.filter((r) => r.resource === "meetings");
  const upcoming = meetings
    .filter((r) => r.starts_at && Date.parse(str(r.starts_at)) >= now)
    .sort((a, b) => Date.parse(str(a.starts_at)) - Date.parse(str(b.starts_at)))[0];
  const task = nextRecordAction(context.timeline.filter((row) => row.resource === "tasks"));
  const notes = context.timeline.filter((r) => r.resource === "notes");
  const emails = context.timeline.filter((r) => r.resource === "activities" && r.type === "email");
  const value = (keys: string[]) => {
    for (const key of keys) {
      const v = record.attributes[key];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return "Non renseigné";
  };
  const feeds = [
    {
      title: "Activité",
      tab: "timeline",
      icon: Activity,
      rows: context.timeline.slice(0, 3),
      count: undefined,
    },
    {
      title: "Emails",
      tab: "activities",
      icon: Mail,
      rows: emails.slice(0, 3),
      count: emails.length,
    },
    {
      title: "Notes",
      tab: "notes",
      icon: FileText,
      rows: notes.slice(0, 3),
      count: context.counts.notes ?? notes.length,
    },
  ];
  return (
    <div className={styles.overview}>
      <h2 className={styles.sectionTitle}>Highlights</h2>
      <div className={styles.highlights}>
        <div className={styles.highlight}>
          <span>
            Revenu annuel estimé
            <CircleDollarSign size={15} />
          </span>
          <strong className={styles.purple}>
            {value(["estimated_arr", "annual_revenue", "revenue"])}
          </strong>
        </div>
        <div className={styles.highlight}>
          <span>
            Financement levé
            <CircleDollarSign size={15} />
          </span>
          <strong>{value(["funding_raised", "funding"])}</strong>
        </div>
        <button onClick={() => onTab("deals")} className={styles.highlight}>
          <span>
            Opportunités
            <Layers3 size={15} />
          </span>
          <strong>
            {deals[0]?.display_name || "Aucune opportunité liée"}
            {deals.length > 1 && <small> +{deals.length - 1}</small>}
          </strong>
        </button>
        <button onClick={() => onTab("timeline")} className={styles.highlight}>
          <span>
            Prochain rendez-vous
            <CalendarDays size={15} />
          </span>
          <strong>{upcoming ? str(upcoming.title) : "Aucun rendez-vous prévu"}</strong>
          <small>
            {upcoming?.starts_at
              ? date(upcoming.starts_at)
              : "Les rendez-vous liés apparaîtront ici"}
          </small>
        </button>
        <button onClick={() => onTab(task?.resource || "tasks")} className={styles.highlight}>
          <span>
            Prochaine tâche
            <CheckSquare size={15} />
          </span>
          <strong>{task ? str(task.title) : "Aucune tâche prévue"}</strong>
          <small className={styles.due}>
            {task?.due_date ? date(task.due_date) : "Planifier une prochaine action"}
          </small>
        </button>
        <div className={styles.highlight}>
          <span>
            Site internet
            <Globe size={15} />
          </span>
          <strong>{record.domain || "Non renseigné"}</strong>
        </div>
      </div>
      {feeds.map(({ title, tab, icon: Icon, rows, count }) => (
        <section className={styles.feedSection} key={tab}>
          <header>
            <h2>
              {title}
              {count !== undefined && <small>{count}</small>}
            </h2>
            <button onClick={() => onTab(tab)}>Tout voir</button>
          </header>
          <div className={styles.feed}>
            {rows.length ? (
              rows.map((row: Row) => (
                <button key={row.id} className={styles.feedRow} onClick={() => onTab(tab)}>
                  {tab === "timeline" ? (
                    <span className={styles.eventIcon}>
                      <Icon size={16} />
                    </span>
                  ) : (
                    <Avatar name={str(row.author_name || row.sender_name) || title} />
                  )}
                  <strong>{str(row.title || row.type) || title}</strong>
                  <span className={styles.excerpt}>
                    {str(row.content || row.summary || row.description)}
                  </span>
                  <time>{date(row.starts_at || row.created_at)}</time>
                </button>
              ))
            ) : (
              <button className={styles.emptyRow} onClick={() => onTab(tab)}>
                <Icon size={16} />
                <span>
                  {tab === "notes"
                    ? "Les notes liées à cette entreprise apparaîtront ici."
                    : tab === "activities"
                      ? "Aucun email consigné pour cette entreprise."
                      : "Aucune activité liée à cette entreprise."}
                </span>
              </button>
            )}
          </div>
        </section>
      ))}
      <section className={styles.feedSection}>
        <header>
          <h2>
            Contacts liés<small>{relatedRecords(context.related, objects, "people").length}</small>
          </h2>
          <button onClick={() => onTab("contacts")}>Tout voir</button>
        </header>
        <div className={styles.feed}>
          {relatedRecords(context.related, objects, "people")
            .slice(0, 3)
            .map((contact) => (
              <button className={styles.feedRow} key={contact.id} onClick={() => onTab("contacts")}>
                <Avatar name={contact.display_name} />
                <strong>{contact.display_name}</strong>
                <span>{contact.email}</span>
              </button>
            ))}
          {!relatedRecords(context.related, objects, "people").length && (
            <button className={styles.emptyRow} onClick={() => onTab("relations")}>
              <Building2 size={16} />
              Relier les interlocuteurs de cette entreprise
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
