"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Archive, Plus } from "lucide-react";
import { request, useRows, useSave, useWorkspace } from "../data-provider";
import { Drawer, Editor, Empty, Badge, str, date, Loading, ErrorMessage, type Field } from "../ui";
import { Pagination } from "../pagination";
import { RecordContextPanel, useRecordContext } from "../record-context";
import { RecordSummary } from "../record-summary";
import type { CrmRecord, Row, Attribute } from "@/lib/domain/types";
import { RecordOverview, RelatedRecordList } from "../record-overview";
import { relatedRecords } from "@/lib/domain/record-profile";
import type { Pipeline } from "@/lib/domain/pipelines";
import styles from "./record-details.module.css";
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
  const { workspace, objects } = useWorkspace();
  const slug = objects.find((o) => o.id === record.object_id)?.slug || "custom";
  const [tab, setTab] = useState("overview");
  const { remove, busy } = useSave();
  const [error, setError] = useState("");
  const readonly = workspace.role === "viewer" || !!record.merged_into;
  const context = useRecordContext(
    record.id,
    "summary",
    ["overview", "contacts", "deals"].includes(tab),
  );
  const members = useRows("memberships", { size: 100 });
  const attrs = useRows<Attribute>("attributes", {
    object_id: record.object_id,
    size: 100,
  });
  const pipelines = useQuery({
    queryKey: ["rows", workspace.id, "pipelines", { size: 100 }],
    enabled: slug === "deals",
    queryFn: () => request<{ data: Pipeline[] }>("/api/" + workspace.id + "/pipelines?size=100"),
  });
  const owner = members.data?.data.find((m) => m.user_id === record.owner_id);
  const overviewLabel =
    slug === "people"
      ? "Profil du contact"
      : slug === "companies"
        ? "Vue du compte"
        : slug === "deals"
          ? "Suivi commercial"
          : "Aperçu";
  const tabs: Record<string, string> = {
    overview: overviewLabel,
    ...(slug === "companies" ? { contacts: "Contacts", deals: "Opportunités" } : {}),
    ...names,
    timeline: "Historique",
    relations: slug === "deals" ? "Parties prenantes" : "Relations",
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title={
        slug === "people"
          ? "Fiche personne"
          : slug === "companies"
            ? "Compte entreprise"
            : slug === "deals"
              ? "Opportunité commerciale"
              : "Fiche CRM"
      }
      className={styles.drawer}
    >
      <div className={styles.recordShell}>
        <RecordSummary record={record} slug={slug} pipelines={pipelines.data?.data ?? []} />
        <div className={styles.toolbar}>
          <span>
            {slug === "people"
              ? "Connaître votre interlocuteur et garder le fil."
              : slug === "companies"
                ? "Les interlocuteurs, les ventes et les engagements de ce compte."
                : "Les informations utiles pour faire avancer cette vente."}
          </span>
          <div>
            <button className="button small" disabled={readonly} onClick={onEdit}>
              <Pencil size={14} />
              Modifier
            </button>
            <button
              className="button small"
              disabled={readonly || busy}
              onClick={async () => {
                if (window.confirm("Archiver cette fiche ?"))
                  try {
                    await remove("records", record.id);
                    onClose();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Archivage impossible");
                  }
              }}
            >
              <Archive size={14} />
              Archiver
            </button>
          </div>
        </div>
        <ErrorMessage error={error ? new Error(error) : null} />
        <nav className={styles.tabs} aria-label="Sections de la fiche">
          {Object.entries(tabs).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={tab === key ? styles.activeTab : ""}
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className={styles.content}>
          {tab === "overview" || tab === "contacts" || tab === "deals" ? (
            <>
              {context.isPending ? (
                <Loading />
              ) : context.error ? (
                <ErrorMessage error={context.error} />
              ) : (
                context.data && (
                  <>
                    {context.data.truncated && (
                      <p className={styles.limitNotice}>
                        Aperçu limité : certaines listes sont tronquées. Les compteurs portent
                        sur les éléments autorisés de cette fiche.
                      </p>
                    )}
                    <ErrorMessage error={members.error || attrs.error || pipelines.error} />
                    {tab === "overview" ? (
                      <RecordOverview
                        record={record}
                        slug={slug}
                        context={context.data}
                        objects={objects}
                        attributes={attrs.data?.data ?? []}
                        owner={str(owner?.display_name)}
                        pipelines={pipelines.data?.data ?? []}
                        onTab={setTab}
                        onEdit={onEdit}
                        readonly={readonly}
                      />
                    ) : (
                      <section className={styles.section}>
                        <div className={styles.sectionHeading}>
                          <h3>
                            {tab === "contacts"
                              ? "Interlocuteurs de cette entreprise"
                              : "Opportunités liées à cette entreprise"}
                          </h3>
                          <button className="button small" onClick={() => setTab("relations")}>
                            Gérer les relations
                          </button>
                        </div>
                        <RelatedRecordList
                          records={relatedRecords(
                            context.data.related,
                            objects,
                            tab === "contacts" ? "people" : "deals",
                          )}
                          objects={objects}
                          onRelations={() => setTab("relations")}
                          empty={
                            tab === "contacts"
                              ? "Aucun contact relié à ce compte."
                              : "Aucune opportunité reliée à ce compte."
                          }
                        />
                      </section>
                    )}
                  </>
                )
              )}
            </>
          ) : tab === "timeline" || tab === "relations" ? (
            <RecordContextPanel key={record.id + tab} record={record} mode={tab} />
          ) : (
            <DetailResource key={record.id + tab} record={record} tab={tab} />
          )}
        </div>
      </div>
    </Drawer>
  );
}

function DetailResource({ record, tab }: { record: CrmRecord; tab: string }) {
  const { workspace } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(0);
  const q = useRows(tab, { record_id: record.id, size: 25, page });
  const { save, busy } = useSave();
  const readonly = workspace.role === "viewer" || !!record.merged_into;
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
        <label className={"button small " + (readonly || uploading ? "disabled" : "")}>
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
                setError(e instanceof Error ? e.message : "Téléversement impossible");
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
      ) : (
        <button className="button small" disabled={readonly} onClick={() => setAdding(true)}>
          <Plus size={14} />{" "}
          {tab === "notes"
            ? "Ajouter une note"
            : tab === "tasks"
              ? "Ajouter une tâche"
              : tab === "commitments"
                ? "Ajouter un engagement"
                : "Consigner une activité"}
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
              <p className="preserve-lines">{str(r.content || r.description || r.source_quote)}</p>
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
            <Empty
              title={
                tab === "notes"
                  ? "Vos notes, au bon endroit"
                  : tab === "tasks"
                    ? "Une prochaine action claire"
                    : tab === "commitments"
                      ? "Gardez une trace de vos engagements"
                      : tab === "documents"
                        ? "Les documents de cette fiche"
                        : "Le fil de vos activités"
              }
              description={
                tab === "notes"
                  ? "Consignez les informations utiles à votre équipe."
                  : tab === "tasks"
                    ? "Ajoutez une tâche et une échéance pour organiser le suivi."
                    : tab === "commitments"
                      ? "Reliez ce qui a été promis à sa réalisation."
                      : tab === "documents"
                        ? "Ajoutez un devis, une proposition ou un document utile."
                        : "Consignez un appel, un email ou une réunion."
              }
            />
          )}
          <Pagination
            page={page}
            size={25}
            total={q.data?.count ?? 0}
            busy={q.isFetching}
            onChange={setPage}
          />
        </div>
      )}
      {adding && (
        <Editor
          open
          onClose={() => setAdding(false)}
          title={
            tab === "notes"
              ? "Ajouter une note"
              : tab === "tasks"
                ? "Planifier une tâche"
                : tab === "commitments"
                  ? "Ajouter un engagement"
                  : "Consigner une activité"
          }
          fields={fieldMap[tab] ?? []}
          busy={busy}
          initial={tab === "activities" ? { type: "comment" } : {}}
          onSave={(v) => save(tab, { ...v, record_id: record.id })}
        />
      )}
    </>
  );
}
