"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { z } from "zod";
import { toast } from "sonner";
import {
  CalendarDays,
  LockKeyhole,
  ExternalLink,
  Copy,
  Download,
  Search,
  Pencil,
  Trash2,
  Plus,
  Users,
  FileText,
  Link2,
  Mic,
  X,
} from "lucide-react";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { Editor, Empty, ErrorMessage, Loading, Modal } from "../ui";
import { RecordPicker } from "../records/picker";
import { request } from "@/lib/api/request";
import {
  meetingDate,
  meetingUrl,
  parseTranscript,
  speakerStats,
  transcriptTimestamp,
  type Meeting,
} from "@/lib/domain/meetings";
import type { Row } from "@/lib/domain/types";
import { MeetingEditor } from "./editor";
import { MeetingInsights } from "./insights";
import styles from "./meetings.module.css";
import { meetingTabKeys } from "./keyboard-tabs";

export function MeetingDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useRows<Meeting>("meetings", { id, size: 1 });
  const meeting = !q.isError ? q.data?.data.find((m) => m.id === id) : undefined;
  return (
    <Modal
      open
      wide
      title={meeting?.title ?? "Détails de la réunion"}
      description="Transcription, informations et analyse de votre échange."
      onClose={onClose}
      className={styles.modal}
    >
      <ErrorMessage error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : meeting ? (
        <MeetingContent key={meeting.id} meeting={meeting} onClose={onClose} />
      ) : (
        !q.isError && (
          <Empty
            title="Réunion inaccessible"
            description="Cette réunion a été supprimée ou vos droits ont changé."
          />
        )
      )}
    </Modal>
  );
}
function MeetingContent({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const { workspace } = useWorkspace();
  const [tab, setTab] = useState("transcript"),
    [term, setTerm] = useState(""),
    [speaker, setSpeaker] = useState("all"),
    [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [task, setTask] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [deleteBusy, setDeleteBusy] = useState(false);
  const { remove, save, busy } = useSave();
  const canWrite = workspace.role !== "viewer";
  const cues = useMemo(() => parseTranscript(meeting.transcript), [meeting.transcript]);
  const stats = useMemo(() => speakerStats(cues), [cues]);
  const speakers = [...new Set(cues.flatMap((c) => (c.speaker ? [c.speaker] : [])))];
  const visible = cues.filter(
    (c) =>
      (speaker === "all" || speaker === c.speaker) &&
      (!term ||
        c.text.toLocaleLowerCase().includes(term.toLocaleLowerCase()) ||
        c.speaker?.toLocaleLowerCase().includes(term.toLocaleLowerCase())),
  );
  const join = meetingUrl(meeting.join_url);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copié");
    } catch {
      setError(new Error("La copie est indisponible dans ce navigateur."));
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([meeting.transcript], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `reunion-${meeting.id}.${meeting.transcript.startsWith("WEBVTT") ? "vtt" : "txt"}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className={styles.detail}>
      <div className={styles.detailMeta}>
        <span>
          <CalendarDays size={14} />
          {meetingDate(meeting.starts_at, workspace.timezone)} ·{" "}
          {meetingDate(meeting.starts_at, workspace.timezone, true)}
          {meeting.ends_at && ` – ${meetingDate(meeting.ends_at, workspace.timezone, true)}`}
        </span>
        <span>
          {meeting.private ? <LockKeyhole size={13} /> : <Users size={13} />}{" "}
          {meeting.private ? "Privée" : "Partagée avec l’équipe"}
        </span>
        <span>{workspace.timezone}</span>
      </div>
      <div className={styles.detailActions}>
        {join && (
          <a href={join} target="_blank" rel="noopener noreferrer" className="button primary">
            <ExternalLink size={14} />
            Rejoindre la réunion
          </a>
        )}
        <button
          className="button small"
          onClick={() =>
            void copy(
              `${window.location.origin}/app/meetings?focus=${meeting.id}&workspace=${workspace.id}`,
            )
          }
        >
          <Link2 size={13} />
          Copier le lien interne
        </button>
        {canWrite && (
          <>
            <button className="button small" onClick={() => setEditing(true)}>
              <Pencil size={13} />
              Modifier
            </button>
            <button className="button small" onClick={() => setTask(true)}>
              <Plus size={13} />
              Créer une tâche
            </button>
            <button
              className="icon-button"
              aria-label="Supprimer la réunion"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
      <ErrorMessage error={error} />
      <div className={styles.detailGrid}>
        <div className={styles.mainPanel}>
          <div className={styles.recording}>
            <div className={styles.audioMark}>
              <Mic size={30} />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div>
              <strong>
                {meeting.transcript
                  ? "La conversation, au même endroit"
                  : "Préparez votre prochain échange"}
              </strong>
              <p>
                {meeting.transcript
                  ? "Retrouvez la transcription, ses passages et les informations de la réunion."
                  : "Ajoutez vos participants, une fiche CRM et le lien de la visioconférence."}
              </p>
              <small>Aucun enregistreur automatique n’est activé pour cet échange.</small>
            </div>
          </div>
          <div
            className={styles.tabs}
            role="tablist"
            aria-label="Détails de la réunion"
            onKeyDown={meetingTabKeys}
          >
            {[
              ["transcript", "Transcription", FileText],
              ["speakers", "Intervenants", Users],
              ["info", "Informations", CalendarDays],
            ].map(([v, l, Icon]) => (
              <button
                role="tab"
                aria-selected={tab === v}
                tabIndex={tab === v ? 0 : -1}
                aria-controls="meeting-detail-panel"
                id={`meeting-detail-${v}`}
                key={String(v)}
                onClick={() => setTab(String(v))}
              >
                {typeof Icon !== "string" && <Icon size={14} />}
                <span>{String(l)}</span>
              </button>
            ))}
          </div>
          <section
            id="meeting-detail-panel"
            role="tabpanel"
            aria-labelledby={`meeting-detail-${tab}`}
          >
            {tab === "transcript" && (
              <>
                <div className={styles.transcriptTools}>
                  <label className={styles.search}>
                    <Search size={14} />
                    <input
                      aria-label="Rechercher dans la transcription"
                      value={term}
                      maxLength={200}
                      onChange={(e) => setTerm(e.target.value)}
                      placeholder="Rechercher un passage…"
                    />
                  </label>
                  {!!cues.length && (
                    <>
                      <button
                        className="icon-button"
                        aria-label="Copier la transcription"
                        onClick={() => void copy(meeting.transcript)}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Télécharger la transcription"
                        onClick={download}
                      >
                        <Download size={14} />
                      </button>
                    </>
                  )}
                </div>
                {meeting.transcript_complete === false && (
                  <p className={styles.notice}>
                    Transcription partielle : certains passages n’ont pas encore été importés.
                  </p>
                )}
                {speakers.length > 0 && (
                  <label className={styles.speakerFilter}>
                    Intervenant
                    <select
                      aria-label="Intervenant"
                      value={speaker}
                      onChange={(e) => setSpeaker(e.target.value)}
                    >
                      <option value="all">Tous les intervenants</option>
                      {speakers.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!cues.length ? (
                  <Empty
                    title="Aucune transcription pour le moment"
                    description="Importez un fichier TXT, VTT ou SRT, ou récupérez une transcription disponible via vos intégrations."
                    action={
                      canWrite && (
                        <button className="button" onClick={() => setEditing(true)}>
                          Ajouter une transcription
                        </button>
                      )
                    }
                  />
                ) : (
                  <div className={styles.transcript} aria-label="Passages de la transcription">
                    {!visible.length ? (
                      <p className={styles.muted}>Aucun passage ne correspond à votre recherche.</p>
                    ) : (
                      visible.map((cue, i) => (
                        <article key={i}>
                          <div>
                            {cue.speaker && <strong>{cue.speaker}</strong>}
                            {cue.start !== null && <time>{transcriptTimestamp(cue.start)}</time>}
                          </div>
                          <p>
                            <Highlight text={cue.text} term={term} />
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
            {tab === "speakers" && (
              <div className={styles.speakerPanel}>
                <h3>Les voix de la conversation</h3>
                {stats.length ? (
                  stats.map((s) => (
                    <article key={s.name}>
                      <span className={styles.avatar}>{s.name.slice(0, 1)}</span>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {transcriptTimestamp(s.seconds)} · {s.percent}% du temps des passages
                          identifiés
                        </small>
                        <meter
                          min="0"
                          max="100"
                          value={s.percent}
                          aria-label={`Part de parole de ${s.name}`}
                        />
                      </div>
                      <button
                        className="button small"
                        onClick={() => {
                          setSpeaker(s.name);
                          setTab("transcript");
                        }}
                      >
                        Voir ses passages
                      </button>
                    </article>
                  ))
                ) : (
                  <p className={styles.muted}>
                    Les durées sont disponibles lorsqu’une transcription fournit les intervenants et
                    des horodatages. Aucun temps de parole n’est estimé à partir du texte.
                  </p>
                )}
                {!stats.length &&
                  speakers.map((s) => (
                    <button
                      className="button"
                      key={s}
                      onClick={() => {
                        setSpeaker(s);
                        setTab("transcript");
                      }}
                    >
                      {s}
                    </button>
                  ))}
              </div>
            )}
            {tab === "info" && (
              <div className={styles.information}>
                <h3>Informations de la réunion</h3>
                <dl>
                  <dt>État</dt>
                  <dd>
                    {meeting.status === "scheduled"
                      ? "Planifiée"
                      : meeting.status === "cancelled"
                        ? "Annulée"
                        : "Terminée"}
                  </dd>
                  <dt>Lieu</dt>
                  <dd>{meeting.location || "Non renseigné"}</dd>
                  <dt>Source</dt>
                  <dd>{meeting.provider === "import" ? "Ajout manuel" : meeting.provider}</dd>
                </dl>
                {meeting.description && (
                  <section>
                    <h4>Description</h4>
                    <p>{meeting.description}</p>
                  </section>
                )}
                {meeting.summary && (
                  <section>
                    <h4>Résumé enregistré</h4>
                    <p>{meeting.summary}</p>
                  </section>
                )}
                <h4>Participants · {meeting.participants.length}</h4>
                {meeting.participants.length ? (
                  <div className={styles.peopleList}>
                    {meeting.participants.map((p, i) => (
                      <div key={i}>
                        <span className={styles.avatar}>{p.name.slice(0, 1)}</span>
                        <span>
                          <strong>{p.name}</strong>
                          {p.email && <small>{p.email}</small>}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.muted}>Aucun participant renseigné.</p>
                )}
                <MeetingLinks id={meeting.id} />
              </div>
            )}
          </section>
        </div>
        <MeetingInsights
          key={meeting.id + ":" + meeting.version}
          id={meeting.id}
          hasSource={!!meeting.transcript.trim() || !!meeting.summary.trim()}
        />
      </div>
      {editing && <MeetingEditor meeting={meeting} onClose={() => setEditing(false)} />}
      {task && (
        <Editor
          open
          title="Créer une tâche de suivi"
          onClose={() => setTask(false)}
          fields={[
            { key: "title", label: "Titre de la tâche", required: true },
            { key: "description", label: "Description", type: "textarea" },
            { key: "due_date", label: "Échéance", type: "datetime-local", nullable: true },
          ]}
          initial={{ title: `Suivi — ${meeting.title}`, description: "" }}
          busy={busy}
          onSave={async (values) => {
            await save("tasks", { ...values, record_id: meeting.record_id, status: "open" });
            setTask(false);
          }}
        />
      )}
      {deleting && (
        <Modal
          open
          title="Supprimer cette réunion ?"
          description="La transcription, les favoris et les liens CRM seront retirés de Zyliad. Le rendez-vous distant ne sera pas annulé."
          onClose={() => {
            if (!deleteBusy) setDeleting(false);
          }}
        >
          <ErrorMessage error={error} />
          <div className="dialog-actions">
            <button className="button" disabled={deleteBusy} onClick={() => setDeleting(false)}>
              Annuler
            </button>
            <button
              className="button danger"
              disabled={deleteBusy}
              onClick={async () => {
                setDeleteBusy(true);
                try {
                  await remove("meetings", meeting.id);
                  onClose();
                } catch (err) {
                  setError(err as Error);
                } finally {
                  setDeleteBusy(false);
                }
              }}
            >
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const index = text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  );
}
function MeetingLinks({ id }: { id: string }) {
  const { workspace, objects } = useWorkspace();
  const cache = useQueryClient();
  const [add, setAdd] = useState(false),
    [record, setRecord] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const q = useQuery({
    queryKey: ["rows", workspace.id, "meeting-links", id],
    queryFn: async () =>
      z
        .object({
          data: z
            .array(
              z.object({
                id: z.uuid(),
                workspace_id: z.uuid(),
                object_id: z.uuid(),
                display_name: z.string(),
                primary: z.boolean(),
              }),
            )
            .max(101),
        })
        .parse(await request(`/api/${workspace.id}/meetings/${id}/links`)),
    retry: false,
  });
  async function change(recordId: string, remove = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request(
        `/api/${workspace.id}/meetings/${id}/links${remove ? `?record=${recordId}` : ""}`,
        remove ? "DELETE" : "POST",
        remove ? undefined : { record_id: recordId },
      );
      if (result.ok !== true || result.record_id !== recordId)
        throw new Error("La modification du lien n’a pas été confirmée.");
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
      setAdd(false);
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className={styles.sectionHeading}>
        <h4>Fiches CRM liées</h4>
        {workspace.role !== "viewer" && (
          <button className="button small" onClick={() => setAdd(!add)}>
            <Plus size={12} />
            Lier une fiche
          </button>
        )}
      </div>
      <ErrorMessage error={q.error} />
      <ErrorMessage error={error} />
      {q.isPending ? (
        <Loading />
      ) : (
        !q.isError && (
          <div className={styles.linkedRecords}>
            {q.data?.data.map((r) => {
              const obj = objects.find((o) => o.id === r.object_id);
              return (
                <div key={r.id}>
                  <Link
                    href={`/app/${obj ? (obj.standard ? obj.slug : "object-" + obj.slug) : "search"}?record=${r.id}&workspace=${workspace.id}`}
                  >
                    <Link2 size={13} />
                    {r.display_name}
                    {r.primary && <small>Principale</small>}
                  </Link>
                  {!r.primary && workspace.role !== "viewer" && (
                    <button
                      className="icon-button"
                      disabled={busy}
                      aria-label={`Retirer le lien ${r.display_name}`}
                      onClick={() => void change(r.id, true)}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              );
            })}
            {!q.data?.data.length && (
              <p className={styles.muted}>
                Liez une personne, une entreprise ou une opportunité pour retrouver cet échange dans
                son contexte.
              </p>
            )}
          </div>
        )
      )}
      {add && (
        <div className={styles.addLink}>
          <RecordPicker name="linked_record" onChange={setRecord} />
          <button
            className="button primary small"
            disabled={!record || busy}
            onClick={() => void change(record)}
          >
            Ajouter le lien
          </button>
        </div>
      )}
    </section>
  );
}
export function CalendarDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const { workspace } = useWorkspace();
  const q = useRows<Row>("communications", { id, size: 1, kind: "calendar" });
  const row = !q.isError ? q.data?.data.find((c) => c.id === id) : undefined;
  return (
    <Modal
      open
      title={String(row?.subject ?? "Rendez-vous du calendrier")}
      description="Événement synchronisé de votre calendrier personnel."
      onClose={onClose}
      className={styles.modal}
    >
      <ErrorMessage error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : row ? (
        <div className={styles.information}>
          <p>
            <CalendarDays size={15} />{" "}
            {meetingDate(
              typeof row.starts_at === "string" ? row.starts_at : null,
              workspace.timezone,
            )}{" "}
            ·{" "}
            {meetingDate(
              typeof row.starts_at === "string" ? row.starts_at : null,
              workspace.timezone,
              true,
            )}
          </p>
          <p className={styles.muted}>
            <LockKeyhole size={13} /> Événement privé · {workspace.timezone}
          </p>
          {typeof row.ends_at === "string" && (
            <p>Fin : {meetingDate(row.ends_at, workspace.timezone, true)}</p>
          )}
          {typeof row.location === "string" && row.location && <p>Lieu : {row.location}</p>}
          {typeof row.join_url === "string" && meetingUrl(row.join_url) && (
            <a
              className="button primary"
              href={meetingUrl(row.join_url)!}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} />
              Rejoindre la réunion
            </a>
          )}
          <h3>Participants</h3>
          {Array.isArray(row.recipients) &&
            row.recipients.map((p, i) => <p key={i}>{String(p)}</p>)}
          <h3>Description</h3>
          <p>{String(row.body || "Aucune description.")}</p>
          <Link className="button" href={`/app/integrations?workspace=${workspace.id}`}>
            <Link2 size={14} />
            Gérer la synchronisation
          </Link>
        </div>
      ) : (
        !q.isError && (
          <Empty
            title="Rendez-vous inaccessible"
            description="Cet événement a été retiré ou vos droits ont changé."
          />
        )
      )}
    </Modal>
  );
}
