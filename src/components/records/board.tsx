"use client";
import { useState } from "react";
import { CalendarDays, GripVertical, Plus } from "lucide-react";
import { Badge, money, str } from "../ui/display";
import { stages, type CrmRecord, type Row } from "@/lib/domain/types";
import styles from "./records.module.css";

export function RecordBoard({
  rows,
  members,
  readonly,
  busy,
  onOpen,
  onCreate,
  onMove,
  stageLabels,
}: {
  rows: CrmRecord[];
  members: Row[];
  readonly: boolean;
  busy: boolean;
  onOpen: (record: CrmRecord) => void;
  onCreate: (stage: string) => void;
  onMove: (record: CrmRecord, stage: string) => Promise<void>;
  stageLabels?: Record<string, string>;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const owners = new Map(
    members.map((member) => [str(member.user_id), str(member.display_name)]),
  );
  return (
    <div
      className={`kanban ${styles.pipeline}`}
      aria-label="Pipeline des opportunités"
    >
      {stages.map((stage) => {
        const deals = rows.filter((record) => record.stage === stage);
        const totals = new Map<string, number>();
        for (const deal of deals) {
          const amount = Number(deal.amount);
          if (Number.isFinite(amount))
            totals.set(
              deal.currency || "EUR",
              (totals.get(deal.currency || "EUR") ?? 0) + amount,
            );
        }
        return (
          <section
            key={stage}
            className={`kanban-column ${dropStage === stage ? styles.dropTarget : ""}`}
            aria-label={`Étape ${stage}`}
            onDragOver={(event) => {
              if (dragging && !readonly && !busy) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropStage(stage);
              }
            }}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setDropStage(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const record = rows.find((row) => row.id === dragging);
              setDragging(null);
              setDropStage(null);
              if (record && record.stage !== stage && !readonly && !busy)
                void onMove(record, stage).catch(() => {});
            }}
          >
            <div className="column-heading">
              <Badge value={stageLabels?.[stage] || stage} />
              <span>{deals.length}</span>
              <button
                type="button"
                className={styles.stageAdd}
                aria-label={`Ajouter une opportunité à ${stage}`}
                disabled={readonly || busy}
                onClick={() => onCreate(stage)}
              >
                <Plus size={14} />
              </button>
            </div>
            <div className={styles.stageValue}>
              {[...totals].map(([currency, total]) => (
                <span key={currency}>{money(total, currency)}</span>
              ))}
              {!totals.size && <span>Aucune valeur sur cette page</span>}
            </div>
            {deals.map((record) => (
              <article
                key={record.id}
                className={`deal-card ${dragging === record.id ? styles.dragging : ""}`}
                draggable={!readonly && !busy}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", record.id);
                  setDragging(record.id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDropStage(null);
                }}
                tabIndex={0}
                aria-label={`Ouvrir l’opportunité ${record.display_name}`}
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    onOpen(record);
                  }
                }}
                onClick={() => onOpen(record)}
              >
                <div className={styles.dealTitle}>
                  <strong>{record.display_name}</strong>
                  <GripVertical size={13} aria-hidden="true" />
                </div>
                <p>{money(record.amount, record.currency || "EUR")}</p>
                {record.close_date && (
                  <span className={styles.dealDate}>
                    <CalendarDays size={12} /> Clôture :{" "}
                    {new Date(
                      record.close_date + "T12:00:00",
                    ).toLocaleDateString("fr-FR")}
                  </span>
                )}
                <div className={styles.dealOwner}>
                  {owners.get(record.owner_id || "") ||
                    (record.owner_id
                      ? "Responsable assigné"
                      : "Sans responsable")}
                </div>
                <select
                  aria-label={`Étape de ${record.display_name}`}
                  value={record.stage}
                  disabled={readonly || busy}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    void onMove(record, event.target.value).catch(() => {})
                  }
                >
                  {stages.map((value) => (
                    <option key={value} value={value}>
                      {stageLabels?.[value] || value}
                    </option>
                  ))}
                </select>
              </article>
            ))}
            {!deals.length && (
              <div className={styles.stageEmpty}>
                <span>Aucune opportunité</span>
                <button
                  type="button"
                  disabled={readonly || busy}
                  onClick={() => onCreate(stage)}
                >
                  <Plus size={13} /> Ajouter ici
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
