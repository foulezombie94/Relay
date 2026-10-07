"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckSquare,
  Users,
  Layers3,
  MessageSquare,
  FileText,
} from "lucide-react";
import { Avatar, Badge, date, money, str } from "./ui/display";
import {
  relatedRecords,
  nextRecordAction,
  linkedDealTotals,
} from "@/lib/domain/record-profile";
import { dealProbability, type Pipeline } from "@/lib/domain/pipelines";
import type {
  Attribute,
  CrmRecord,
  ObjectDefinition,
} from "@/lib/domain/types";
import type { RecordContext } from "./record-context";
import styles from "./pages/record-details.module.css";
type Props = {
  record: CrmRecord;
  slug: string;
  context: RecordContext;
  objects: ObjectDefinition[];
  attributes: Attribute[];
  owner: string;
  pipelines: Pipeline[];
  onTab: (tab: string) => void;
  onEdit: () => void;
  readonly: boolean;
};
function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <h3>
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
export function RelatedRecordList({
  records,
  objects,
  onRelations,
  empty,
}: {
  records: CrmRecord[];
  objects: ObjectDefinition[];
  onRelations: () => void;
  empty: string;
}) {
  return records.length ? (
    <ul className={styles.relatedList}>
      {records.map((r) => {
        const object = objects.find((o) => o.id === r.object_id);
        return (
          <li key={r.id}>
            <Link
              prefetch={false}
              href={
                "/app/" +
                (object?.standard ? object.slug : "object-" + object?.slug) +
                "?record=" +
                r.id
              }
            >
              <Avatar name={r.display_name} />
              <span>
                <strong>{r.display_name}</strong>
                <small>
                  {object?.slug === "deals"
                    ? money(r.amount, r.currency || "EUR")
                    : r.email || r.domain || object?.name}
                </small>
              </span>
              {object?.slug === "deals" && <Badge value={r.stage} />}
              <ArrowUpRight size={15} />
            </Link>
          </li>
        );
      })}
    </ul>
  ) : (
    <div className={styles.emptyInline}>
      <p>{empty}</p>
      <button type="button" className="text-link" onClick={onRelations}>
        Relier une fiche <ArrowRight size={13} />
      </button>
    </div>
  );
}
export function RecordOverview({
  record,
  slug,
  context,
  objects,
  attributes,
  owner,
  pipelines,
  onTab,
  onEdit,
  readonly,
}: Props) {
  const contacts = relatedRecords(context.related, objects, "people"),
    companies = relatedRecords(context.related, objects, "companies"),
    deals = relatedRecords(context.related, objects, "deals");
  const next = nextRecordAction(context.timeline);
  const totals = linkedDealTotals(deals);
  const recent = context.timeline
    .filter((r) => ["activities", "meetings"].includes(r.resource))
    .slice(0, 4);
  const commitments = context.timeline
    .filter((r) => r.resource === "commitments")
    .slice(0, 3);
  const manage = (
    <button
      type="button"
      className={styles.subtleButton}
      onClick={() => onTab("relations")}
    >
      Gérer <ArrowRight size={13} />
    </button>
  );
  const properties = (
    <Section
      title={
        slug === "companies"
          ? "Informations de l’entreprise"
          : slug === "deals"
            ? "Détails de la vente"
            : "Informations du contact"
      }
      icon={
        slug === "companies" ? <Building2 size={16} /> : <FileText size={16} />
      }
      action={
        <button
          type="button"
          className={styles.subtleButton}
          disabled={readonly}
          onClick={onEdit}
        >
          Modifier
        </button>
      }
    >
      <dl className={styles.properties}>
        <div>
          <dt>Responsable</dt>
          <dd>{owner || "Non attribué"}</dd>
        </div>
        {slug !== "deals" && (
          <>
            <div>
              <dt>Email</dt>
              <dd>
                {record.email ? (
                  <a href={"mailto:" + record.email}>{record.email}</a>
                ) : (
                  "Non renseigné"
                )}
              </dd>
            </div>
            <div>
              <dt>Site internet</dt>
              <dd>{record.domain || "Non renseigné"}</dd>
            </div>
          </>
        )}
        {slug === "deals" && (
          <>
            <div>
              <dt>Valeur pondérée</dt>
              <dd>
                {["Gagné", "Perdu"].includes(record.stage)
                  ? "Exclue des prévisions ouvertes"
                  : money(
                      (Number(record.amount) *
                        dealProbability(record, pipelines)) /
                        100,
                      record.currency || "EUR",
                    )}
              </dd>
            </div>
            <div>
              <dt>Type de probabilité</dt>
              <dd>
                {record.probability == null
                  ? "Probabilité du pipeline"
                  : "Probabilité spécifique"}
              </dd>
            </div>
          </>
        )}
        {attributes
          .filter((a) => !a.archived)
          .map((a) => (
            <div key={a.id}>
              <dt>{a.name}</dt>
              <dd>
                {typeof record.attributes?.[a.key] === "boolean"
                  ? record.attributes[a.key]
                    ? "Oui"
                    : "Non"
                  : str(record.attributes?.[a.key]) || "Non renseigné"}
              </dd>
            </div>
          ))}
        <div>
          <dt>Ajout {slug === "companies" ? "du compte" : "de la fiche"}</dt>
          <dd>{date(record.created_at)}</dd>
        </div>
      </dl>
    </Section>
  );
  const nextAction = (
    <section className={styles.nextAction}>
      <div className={styles.sectionHeading}>
        <h3>
          <CheckSquare size={17} />
          {slug === "deals"
            ? "Faire avancer la vente"
            : slug === "companies"
              ? "Prochaine action sur ce compte"
              : "Prochaine action"}
        </h3>
      </div>
      {next ? (
        <>
          <strong>{str(next.title)}</strong>
          <p>
            {next.due_date ? date(next.due_date) : "Sans échéance"}
            <span>
              {" "}
              ·{" "}
              {next.resource === "commitments" ? "Engagement client" : "Tâche"}
            </span>
          </p>
          <button
            type="button"
            className="button small"
            onClick={() => onTab(next.resource)}
          >
            Ouvrir{" "}
            {next.resource === "commitments" ? "les engagements" : "les tâches"}
            <ArrowRight size={14} />
          </button>
        </>
      ) : (
        <>
          <p>Aucune action ouverte dans les éléments chargés.</p>
          <button
            type="button"
            className="button small"
            onClick={() => onTab("tasks")}
          >
            Planifier une tâche <ArrowRight size={14} />
          </button>
        </>
      )}
    </section>
  );
  const interactions = (
    <Section
      title={
        slug === "people"
          ? "Derniers échanges et rendez-vous"
          : "Activité récente"
      }
      icon={<MessageSquare size={16} />}
      action={
        <button
          type="button"
          className={styles.subtleButton}
          onClick={() => onTab("timeline")}
        >
          Tout voir <ArrowRight size={13} />
        </button>
      }
    >
      {recent.length ? (
        <ul className={styles.interactions}>
          {recent.map((r) => (
            <li key={r.resource + r.id}>
              <span className={styles.eventIcon}>
                {r.resource === "meetings" ? (
                  <CalendarDays size={16} />
                ) : (
                  <MessageSquare size={16} />
                )}
              </span>
              <div>
                <strong>{str(r.title || r.type || "Échange")}</strong>
                <p>{str(r.content || r.summary).slice(0, 180)}</p>
                <small>{date(r.starts_at || r.created_at)}</small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyInline}>
          <p>
            {slug === "people"
              ? "Les échanges et rendez-vous liés à ce contact apparaîtront ici."
              : "L’historique des actions liées à cette fiche apparaîtra ici."}
          </p>
          <button
            type="button"
            className="text-link"
            onClick={() => onTab("activities")}
          >
            Consigner une activité <ArrowRight size={13} />
          </button>
        </div>
      )}
    </Section>
  );
  const delivery = (
    <Section
      title="Engagements client"
      icon={<CheckSquare size={16} />}
      action={
        <button
          type="button"
          className={styles.subtleButton}
          onClick={() => onTab("commitments")}
        >
          Tout voir <ArrowRight size={13} />
        </button>
      }
    >
      {commitments.length ? (
        <ul className={styles.commitmentList}>
          {commitments.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{str(r.title)}</strong>
                <small>
                  {r.due_date
                    ? "Échéance : " + date(r.due_date)
                    : "Sans échéance"}
                </small>
              </div>
              <Badge value={r.status} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyInline}>
          <p>Suivez ici ce qui a été promis à ce client.</p>
          <button
            type="button"
            className="text-link"
            onClick={() => onTab("commitments")}
          >
            Ouvrir les engagements <ArrowRight size={13} />
          </button>
        </div>
      )}
    </Section>
  );
  if (slug === "companies")
    return (
      <div className={styles.companyLayout}>
        <div className={styles.companyMain}>
          <Section
            title="Portefeuille commercial lié"
            icon={<Layers3 size={16} />}
            action={
              <button
                type="button"
                className={styles.subtleButton}
                onClick={() => onTab("deals")}
              >
                Opportunités <ArrowRight size={13} />
              </button>
            }
          >
            {Object.keys(totals).length > 0 && (
              <div className={styles.accountTotals}>
                {Object.entries(totals).map(([currency, total]) => (
                  <div key={currency}>
                    <div>
                      <span>Pipeline ouvert · {currency}</span>
                      <strong>{money(total.open, currency)}</strong>
                    </div>
                    <div>
                      <span>Ventes gagnées · {currency}</span>
                      <strong>{money(total.won, currency)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <RelatedRecordList
              records={deals.slice(0, 4)}
              objects={objects}
              onRelations={() => onTab("relations")}
              empty="Reliez les opportunités de ce compte pour suivre sa valeur commerciale."
            />
          </Section>
          <Section
            title={"Contacts du compte · " + contacts.length}
            icon={<Users size={16} />}
            action={manage}
          >
            <RelatedRecordList
              records={contacts.slice(0, 4)}
              objects={objects}
              onRelations={() => onTab("relations")}
              empty="Ajoutez les interlocuteurs de cette entreprise à ses relations."
            />
          </Section>
          {delivery}
        </div>
        <aside className={styles.sideColumn}>
          {nextAction}
          {properties}
        </aside>
      </div>
    );
  if (slug === "deals")
    return (
      <div className={styles.dealLayout}>
        <div className={styles.mainColumn}>
          {nextAction}
          <Section
            title="Parties prenantes de la vente"
            icon={<Users size={16} />}
            action={manage}
          >
            <RelatedRecordList
              records={[...companies, ...contacts]}
              objects={objects}
              onRelations={() => onTab("relations")}
              empty="Reliez une entreprise et vos interlocuteurs pour préciser qui participe à la vente."
            />
          </Section>
          {interactions}
          {delivery}
        </div>
        <aside className={styles.sideColumn}>
          {properties}
          <Section title="Documents commerciaux" icon={<FileText size={16} />}>
            <p className={styles.bodyCopy}>
              Devis, propositions et documents liés à cette vente.
            </p>
            <button
              className="button small"
              type="button"
              onClick={() => onTab("documents")}
            >
              Ouvrir les documents
            </button>
          </Section>
        </aside>
      </div>
    );
  return (
    <div className={styles.personLayout}>
      <aside className={styles.sideColumn}>
        {properties}
        <Section
          title="Entreprise et relations"
          icon={<Building2 size={16} />}
          action={manage}
        >
          <RelatedRecordList
            records={companies}
            objects={objects}
            onRelations={() => onTab("relations")}
            empty="Reliez ce contact à son entreprise."
          />
        </Section>
      </aside>
      <div className={styles.mainColumn}>
        {nextAction}
        {interactions}
        <Section
          title="Opportunités de ce contact"
          icon={<Layers3 size={16} />}
          action={manage}
        >
          <RelatedRecordList
            records={deals.slice(0, 4)}
            objects={objects}
            onRelations={() => onTab("relations")}
            empty="Les opportunités liées à cet interlocuteur apparaîtront ici."
          />
        </Section>
      </div>
    </div>
  );
}
