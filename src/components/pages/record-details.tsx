"use client";
import { useState } from "react";
import { useRows, useSave, useWorkspace } from "../data-provider";
import {
  Drawer,
  Editor,
  Empty,
  Badge,
  str,
  date,
  Loading,
  ErrorMessage,
  type Field,
} from "../ui";
import { RecordContextPanel } from "../record-context";
import { RecordSummary } from "../record-summary";
import type { CrmRecord, Row } from "@/lib/domain/types";
const names: Record<string, string> = {
  timeline: "Contexte",
  relations: "Relations",
  notes: "Notes",
  tasks: "Tâches",
  commitments: "Engagements",
  activities: "Activité",
  documents: "Documents",
};
export function RecordDetails({
  record,
  onClose,
  onEdit,
}: {
  record: CrmRecord;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { workspace } = useWorkspace();
  const [tab, setTab] = useState("timeline");
  const { remove } = useSave();
  const [error, setError] = useState("");
  const readonly = workspace.role === "viewer";
  return (
    <Drawer open onClose={onClose} title={record.display_name}>
      <div className="detail-card">
        <RecordSummary
          record={record}
          onTasks={() => setTab("tasks")}
          onCommitments={() => setTab("commitments")}
          onRelations={() => setTab("relations")}
        />
        <div className="row-actions">
          <button className="button small" disabled={readonly} onClick={onEdit}>
            Modifier
          </button>
          <button
            className="button small"
            disabled={readonly}
            onClick={async () => {
              if (window.confirm("Archiver cette fiche ?"))
                try {
                  await remove("records", record.id);
                  onClose();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Archivage impossible",
                  );
                }
            }}
          >
            Archiver
          </button>
        </div>
        <ErrorMessage error={error ? new Error(error) : null} />
      </div>
      <div className="tabs" aria-label="Contexte de la fiche">
        {Object.entries(names).map(([t, label]) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "timeline" || tab === "relations" ? (
        <RecordContextPanel key={record.id + tab} record={record} mode={tab} />
      ) : (
        <DetailResource key={record.id + tab} record={record} tab={tab} />
      )}
    </Drawer>
  );
}
function DetailResource({ record, tab }: { record: CrmRecord; tab: string }) {
  const { workspace } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const q = useRows(tab, { record_id: record.id, size: 100 });
  const { save, busy } = useSave();
  const readonly = workspace.role === "viewer";
  const fieldMap: Record<string, Field[]> = {
    notes: [
      { key: "title", label: "Titre" },
      { key: "content", label: "Contenu", type: "textarea", required: true },
      { key: "private", label: "Note privée", type: "checkbox" },
    ],
    tasks: [
      { key: "title", label: "Action", required: true },
      { key: "due_date", label: "Échéance", type: "datetime-local" },
    ],
    commitments: [
      { key: "title", label: "Engagement", required: true },
      { key: "source_quote", label: "Passage source", type: "textarea" },
      { key: "due_date", label: "Échéance", type: "datetime-local" },
    ],
    activities: [
      {
        key: "type",
        label: "Type",
        type: "select",
        required: true,
        options: [
          ["call", "Appel"],
          ["meeting", "Réunion"],
          ["email", "Email"],
          ["comment", "Commentaire"],
        ].map(([value, label]) => ({ value, label })),
      },
      {
        key: "content",
        label: "Compte rendu",
        type: "textarea",
        required: true,
      },
    ],
  };
  return (
    <>
      <ErrorMessage error={q.error} />
      <ErrorMessage error={error ? new Error(error) : null} />
      {tab === "documents" ? (
        <label
          className={
            "button small " + (readonly || uploading ? "disabled" : "")
          }
        >
          {uploading ? "Téléversement…" : "Ajouter un fichier"}
          <input
            className="sr-only"
            type="file"
            disabled={readonly || uploading}
            accept=".pdf,.txt,.csv,.png,.jpg,.jpeg,.xlsx"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const data = new FormData();
              data.set("file", file);
              data.set("record_id", record.id);
              setUploading(true);
              setError("");
              try {
                const r = await fetch("/api/" + workspace.id + "/files", {
                  method: "POST",
                  body: data,
                });
                const result = await r.json();
                if (!r.ok) throw new Error(result.error);
                await q.refetch();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Téléversement impossible",
                );
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
      ) : (
        <button
          className="button small"
          disabled={readonly}
          onClick={() => setAdding(true)}
        >
          Ajouter
        </button>
      )}
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="stack">
          {q.data?.data.map((r: Row) => (
            <article className="detail-card" key={r.id}>
              <div className="card-head">
                <strong>{str(r.title || r.name || r.type)}</strong>
                <small>{date(r.created_at)}</small>
              </div>
              {r.status ? <Badge value={r.status} /> : null}
              {r.private === true && <span className="pill">Note privée</span>}
              <p className="preserve-lines">
                {str(r.content || r.description || r.source_quote)}
              </p>
              {r.due_date ? <small>Échéance : {date(r.due_date)}</small> : null}
              {tab === "documents" && (
                <a
                  className="button small"
                  target="_blank"
                  rel="noreferrer"
                  href={"/api/" + workspace.id + "/files?id=" + r.id}
                >
                  Ouvrir le fichier
                </a>
              )}
            </article>
          ))}
          {q.data?.data.length === 0 && (
            <Empty description="Ajoutez du contexte à cette fiche." />
          )}
          {(q.data?.count ?? 0) > 100 && (
            <p>
              100 éléments affichés. Retrouvez la suite dans la page dédiée.
            </p>
          )}
        </div>
      )}
      {adding && (
        <Editor
          open
          onClose={() => setAdding(false)}
          title="Ajouter du contexte"
          fields={fieldMap[tab] ?? []}
          busy={busy}
          initial={tab === "activities" ? { type: "comment" } : {}}
          onSave={(v) => save(tab, { ...v, record_id: record.id })}
        />
      )}
    </>
  );
}
