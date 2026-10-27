"use client";
import { Pencil, Trash2, Check, FileText } from "lucide-react";
import { Badge, date, str } from "../ui/display";
import type { CrmRecord, Row } from "@/lib/domain/types";
import { workspaceHref } from "@/lib/domain/workspace-navigation";
export function ResourceCard({
  row,
  resource,
  expanded = false,
  readOnly = false,
  busy = false,
  onToggle,
  onEdit,
  onDelete,
  onPortal,
  onComplete,
}: {
  row: Row;
  resource: string;
  expanded?: boolean;
  readOnly?: boolean;
  busy?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPortal: () => void;
  onComplete: () => void;
}) {
  return (
    <article key={row.id} className="detail-card">
      <div className="card-head">
        <div>
          <h3 onClick={onToggle} style={{ cursor: "pointer" }}>
            {str(row.title || row.name) || "Sans titre"}
          </h3>
          <small>
            {date(row.due_date || row.starts_at || row.created_at)}
            {row.record_id
              ? " · " + ((row.record as CrmRecord | null)?.display_name ?? "Fiche associée")
              : ""}
          </small>
        </div>
        <div className="row-actions">
          {row.status ? <Badge value={row.status} /> : null}
          {resource === "portals" && (
            <button className="button small" onClick={onPortal}>
              Gérer le partage
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Modifier"
            disabled={readOnly}
            onClick={onEdit}
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Supprimer"
            disabled={readOnly || busy}
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {(resource === "notes" || expanded) && (
        <p>{str(row.content || row.description || row.transcript || row.scope)}</p>
      )}
      {row.source_quote ? <blockquote className="quote">{str(row.source_quote)}</blockquote> : null}
      {resource === "conflicts" && (
        <div className="split">
          {["source_a", "source_b"].map((key) => {
            const source = (row[key] ?? {}) as Record<string, unknown>;
            return (
              <blockquote key={key} className="quote">
                <strong>{str(source.label)}</strong>
                <p>{str(source.quote)}</p>
                <Badge value={source.value} />
              </blockquote>
            );
          })}
        </div>
      )}
      {row.evidence ? (
        <p>
          <strong>Preuve :</strong> {str(row.evidence)}
        </p>
      ) : null}
      {row.resolution ? (
        <p>
          <strong>Décision :</strong> {str(row.resolution)}
        </p>
      ) : null}
      {resource === "handovers" && expanded && (
        <>
          <p>
            <strong>Exclusions :</strong> {str(row.exclusions)}
          </p>
          <h4>Engagements transmis</h4>
          <ul>
            {(Array.isArray(row.commitments_snapshot) ? row.commitments_snapshot : []).map(
              (commitment: Record<string, unknown>, index: number) => (
                <li key={index}>
                  {str(commitment.title)} · <Badge value={commitment.status} />
                </li>
              ),
            )}
          </ul>
          <h4>Jalons</h4>
          <ul>
            {(Array.isArray(row.milestones) ? row.milestones : []).map(
              (milestone: Record<string, unknown>, index: number) => (
                <li key={index}>
                  {milestone.done ? "✓ " : ""}
                  {str(milestone.title)} · {str(milestone.date) || "Sans date"}
                </li>
              ),
            )}
          </ul>
        </>
      )}
      {resource === "tasks" && !["done", "cancelled"].includes(str(row.status)) && (
        <div className="card-actions">
          <button className="button small" disabled={readOnly || busy} onClick={onComplete}>
            <Check size={13} />
            Terminer
          </button>
        </div>
      )}
      {resource === "lists" && (
        <div className="card-actions">
          <a className="button small" href={workspaceHref("/app/list-" + row.id, row.workspace_id)}>
            <FileText size={13} />
            Ouvrir la liste
          </a>
        </div>
      )}
    </article>
  );
}
