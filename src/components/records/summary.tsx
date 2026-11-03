"use client";
import { Layers3, Mail, Globe, CalendarDays } from "lucide-react";
import { CompanyLogo } from "./company-logo";
import { Avatar, Badge, date, money } from "../ui/display";
import { dealProbability, openStages, stageLabel, type Pipeline } from "@/lib/domain/pipelines";
import type { CrmRecord } from "@/lib/domain/types";
import styles from "./record-details.module.css";
export function RecordSummary({
  record,
  slug,
  pipelines,
}: {
  record: CrmRecord;
  slug: string;
  pipelines: Pipeline[];
}) {
  const pipeline = pipelines.find((p) => p.id === record.pipeline_id);
  const probability = dealProbability(record, pipelines);
  return (
    <header className={styles.identity} data-kind={slug}>
      <div className={styles.identityMain}>
        <span className={styles.identityAvatar}>
          {slug === "people" ? (
            <Avatar name={record.display_name} />
          ) : slug === "companies" ? (
            <CompanyLogo name={record.display_name} domain={record.domain} size={48} />
          ) : (
            <Layers3 size={26} />
          )}
        </span>
        <div>
          <h2>{record.display_name}</h2>
          <div className={styles.identityMeta}>
            {slug === "deals" ? (
              <>
                <Badge value={pipeline?.labels[record.stage] || record.stage} />
                <span>{pipeline?.name || "Pipeline non renseigné"}</span>
              </>
            ) : (
              <>
                {record.email && (
                  <a href={"mailto:" + record.email}>
                    <Mail size={14} />
                    {record.email}
                  </a>
                )}
                {record.domain && (
                  <span>
                    <Globe size={14} />
                    {record.domain}
                  </span>
                )}
                {!record.email && !record.domain && <span>Coordonnées à compléter</span>}
              </>
            )}
          </div>
        </div>
      </div>
      {slug === "deals" && (
        <>
          <div className={styles.dealNumbers}>
            <div>
              <span>Valeur de l’opportunité</span>
              <strong>{money(record.amount, record.currency || "EUR")}</strong>
            </div>
            <div>
              <span>Probabilité commerciale</span>
              <strong>{probability} %</strong>
              <small>
                {record.probability == null
                  ? "Selon l’étape du pipeline"
                  : "Définie sur cette opportunité"}
              </small>
            </div>
            <div>
              <span>Clôture prévue</span>
              <strong className={styles.closeDate}>
                <CalendarDays size={17} />
                {record.close_date ? date(record.close_date) : "À définir"}
              </strong>
            </div>
          </div>
          <ol className={styles.stageTrack} aria-label="Étapes du pipeline">
            {openStages(pipeline).map((stage, index, open) => (
              <li
                key={stage}
                data-current={record.stage === stage}
                data-passed={
                  record.stage === "Gagné" ||
                  (index < open.indexOf(record.stage) && record.stage !== "Perdu")
                }
                aria-current={record.stage === stage ? "step" : undefined}
              >
                <span />
                {stageLabel(pipeline, stage)}
              </li>
            ))}
          </ol>
          {record.stage === "Perdu" && (
            <p className={styles.lossReason}>
              Raison de perte : {record.lost_reason || "Non renseignée"}
            </p>
          )}
        </>
      )}
    </header>
  );
}
