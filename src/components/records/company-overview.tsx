"use client";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckSquare,
  Clock3,
  FileText,
  Layers3,
  Mail,
  MessageSquare,
  Users,
} from "lucide-react";
import type { CrmRecord, ObjectDefinition, Row } from "@/lib/domain/types";
import { relatedRecords, nextRecordAction } from "@/lib/domain/record-profile";
import type { RecordContext } from "./context";
import { Avatar, date, money, str } from "../ui/display";
import styles from "./company-overview.module.css";

const eventTypes: Record<string, { label: string; icon: typeof FileText }> = {
  notes: { label: "Note", icon: FileText },
  tasks: { label: "Tâche", icon: CheckSquare },
  commitments: { label: "Engagement", icon: CheckSquare },
  meetings: { label: "Rendez-vous", icon: CalendarDays },
  activities: { label: "Échange", icon: MessageSquare },
};
const eventTime = (row: Row) => Date.parse(str(row.created_at)) || 0;

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
  const [filter, setFilter] = useState("all");
  const contacts = relatedRecords(context.related, objects, "people");
  const deals = relatedRecords(context.related, objects, "deals");
  const next = nextRecordAction(context.timeline);
  const meeting = context.timeline
    .filter((r) => r.resource === "meetings" && Date.parse(str(r.starts_at)) >= now)
    .sort((a, b) => Date.parse(str(a.starts_at)) - Date.parse(str(b.starts_at)))[0];
  const notes = context.timeline
    .filter((r) => r.resource === "notes")
    .sort((a, b) => eventTime(b) - eventTime(a));
  const events = context.timeline
    .filter(
      (r) =>
        eventTypes[r.resource] &&
        (filter === "all" ||
          (filter === "emails"
            ? r.resource === "activities" && r.type === "email"
            : r.resource === filter)),
    )
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, 5);
  const count = (resource: string) =>
    context.counts[resource] ?? context.timeline.filter((r) => r.resource === resource).length;
  const due = next?.due_date ? Date.parse(str(next.due_date)) : NaN;
  const overdue = Number.isFinite(due) && due < now;
  return (
    <div className={styles.overview}>
      <div className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>LA RELATION EN UN COUP D’ŒIL</span>
          <h2>Chaque échange, une suite.</h2>
        </div>
        <span className={styles.contextLabel}>
          <Clock3 size={13} />
          {context.truncated ? "Aperçu partiel" : "Vue d’ensemble"}
        </span>
      </div>
      <section className={styles.nextStep} aria-label="Prochaine action">
        <div className={styles.nextIcon}>
          <ArrowRight size={22} />
        </div>
        <div className={styles.nextCopy}>
          <span className={styles.eyebrow}>{overdue ? "À REPRENDRE" : "LE PROCHAIN PAS"}</span>
          <h3>{next ? str(next.title) || "Action à suivre" : "Et si on préparait la suite ?"}</h3>
          <p>
            {next
              ? next.due_date
                ? (overdue ? "Échéance passée · " : "À prévoir · ") + date(next.due_date)
                : "Une action en attente pour cette entreprise"
              : "Une tâche ou un rappel pour garder le fil de cette relation."}
          </p>
          <button type="button" onClick={() => onTab(next?.resource || "tasks")}>
            {next ? "Voir l’action" : "Organiser le suivi"}
            <ArrowRight size={14} />
          </button>
        </div>
        <div className={styles.appointment}>
          <CalendarDays size={17} />
          <div>
            <span>Prochain rendez-vous</span>
            <strong>{meeting ? str(meeting.title) || "Rendez-vous" : "L’agenda est libre"}</strong>
            <small>
              {meeting ? date(meeting.starts_at) : "Les rendez-vous liés s’afficheront ici"}
            </small>
          </div>
        </div>
      </section>
      <div className={styles.metrics} aria-label="Repères de la relation">
        {[
          { label: "Contacts liés", value: contacts.length, icon: Users, tab: "contacts" },
          { label: "Opportunités", value: deals.length, icon: Layers3, tab: "deals" },
          { label: "Notes", value: count("notes"), icon: FileText, tab: "notes" },
        ].map(({ label, value, icon: Icon, tab }) => (
          <button type="button" key={tab} onClick={() => onTab(tab)}>
            <Icon size={16} />
            <span>{label}</span>
            <strong>{value}</strong>
            <ArrowRight size={13} />
          </button>
        ))}
      </div>
      <div className={styles.workspace}>
        <section className={styles.journal}>
          <div className={styles.sectionHeading}>
            <div>
              <h3>Le fil de la relation</h3>
              <p>L’essentiel de vos derniers échanges.</p>
            </div>
            <button
              type="button"
              onClick={() => onTab("timeline")}
              aria-label="Voir tout l’historique"
            >
              <ArrowRight size={17} />
            </button>
          </div>
          <div className={styles.filters} role="group" aria-label="Filtrer le fil de la relation">
            {[
              ["all", "Tout"],
              ["emails", "Emails"],
              ["notes", "Notes"],
              ["meetings", "Rendez-vous"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {events.length ? (
            <ol className={styles.timeline}>
              {events.map((row) => {
                const { label, icon: Icon } =
                  row.type === "email" ? { label: "Email", icon: Mail } : eventTypes[row.resource];
                return (
                  <li key={row.resource + row.id}>
                    <span className={styles.eventIcon}>
                      <Icon size={15} />
                    </span>
                    <button
                      type="button"
                      onClick={() => onTab(row.resource === "meetings" ? "timeline" : row.resource)}
                    >
                      <span className={styles.eventMeta}>
                        {label}
                        <time>{date(row.created_at)}</time>
                      </span>
                      <strong>{str(row.title || row.type) || label}</strong>
                      {row.content || row.summary || row.description ? (
                        <p>{str(row.content || row.summary || row.description)}</p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className={styles.emptyJournal}>
              <span>
                <MessageSquare size={25} strokeWidth={1.4} />
              </span>
              <h4>{filter === "all" ? "L’histoire commence ici" : "Rien dans cette catégorie"}</h4>
              <p>
                {filter === "all"
                  ? "Consignez un premier échange pour retrouver le contexte au bon moment."
                  : filter === "emails"
                    ? "Aucun email consigné pour cette entreprise."
                    : "Les éléments liés apparaîtront dans ce fil."}
              </p>
              <button
                type="button"
                onClick={() => onTab(filter === "notes" ? "notes" : "activities")}
              >
                {filter === "notes" ? "Ouvrir les notes" : "Ouvrir les échanges"}
                <ArrowRight size={13} />
              </button>
            </div>
          )}
          {context.truncated && (
            <p className={styles.limit}>
              Cet aperçu est limité aux éléments chargés. Ouvrez l’historique pour poursuivre.
            </p>
          )}
        </section>
        <div className={styles.sideStack}>
          <section className={styles.sideCard}>
            <div className={styles.sectionHeading}>
              <h3>Les interlocuteurs</h3>
              <Users size={15} />
            </div>
            {contacts.length ? (
              contacts.slice(0, 3).map((contact) => (
                <button
                  type="button"
                  className={styles.contact}
                  key={contact.id}
                  onClick={() => onTab("contacts")}
                >
                  <Avatar name={contact.display_name} />
                  <span>
                    <strong>{contact.display_name}</strong>
                    <small>{contact.email || "Contact lié"}</small>
                  </span>
                  <ArrowRight size={13} />
                </button>
              ))
            ) : (
              <p className={styles.emptyCopy}>
                Qui fait avancer la relation chez {record.display_name} ?
              </p>
            )}
            <button
              type="button"
              className={styles.textAction}
              onClick={() => onTab(contacts.length ? "contacts" : "relations")}
            >
              {contacts.length ? "Tous les contacts" : "Relier un contact"}
              <ArrowRight size={13} />
            </button>
          </section>
          <section className={styles.sideCard}>
            <div className={styles.sectionHeading}>
              <h3>Côté commercial</h3>
              <Layers3 size={15} />
            </div>
            {deals.length ? (
              deals.slice(0, 2).map((deal) => (
                <button
                  type="button"
                  className={styles.deal}
                  key={deal.id}
                  onClick={() => onTab("deals")}
                >
                  <span>{deal.stage}</span>
                  <strong>{deal.display_name}</strong>
                  <small>{money(deal.amount, deal.currency || "EUR")}</small>
                </button>
              ))
            ) : (
              <p className={styles.emptyCopy}>
                Les opportunités liées et leur avancement, à portée de main.
              </p>
            )}
            <button
              type="button"
              className={styles.textAction}
              onClick={() => onTab(deals.length ? "deals" : "relations")}
            >
              {deals.length ? "Voir les opportunités" : "Relier une opportunité"}
              <ArrowRight size={13} />
            </button>
          </section>
          <section className={styles.noteCard}>
            <span className={styles.eyebrow}>
              <FileText size={13} /> À GARDER EN TÊTE
            </span>
            <p>
              {notes[0]
                ? str(notes[0].content || notes[0].title)
                : "Un détail utile, une préférence, une idée pour le prochain échange…"}
            </p>
            <button type="button" className={styles.textAction} onClick={() => onTab("notes")}>
              {notes.length ? "Retrouver les notes" : "Ouvrir les notes"}
              <ArrowRight size={13} />
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
