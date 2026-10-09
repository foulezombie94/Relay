"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace, useRows, useSave, request } from "../providers/data-provider";
import {
  PageHeader,
  AddButton,
  Editor,
  Modal,
  Empty,
  ErrorMessage,
  Badge,
  str,
  date,
} from "../ui";
import { RecordPicker } from "../records/picker";
import { RepeatFields } from "../ui/structured-fields";
import { Pagination } from "../ui/pagination";
import {
  sequenceMessage,
  sequenceSteps,
  nextSequenceDate,
} from "@/lib/domain/sequences";
import type { Row, CrmRecord } from "@/lib/domain/types";
export function SequencesPage() {
  const { workspace } = useWorkspace();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const q = useRows("sequences", { size: 25, page, q: search });
  const [editing, setEditing] = useState<Row | true | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const { save, busy } = useSave();
  const readonly = workspace.role === "viewer";
  return (
    <>
      <PageHeader
        title="Séquences de suivi"
        description="Des suivis planifiés, interrompus lorsque votre contact répond."
        action={
          <AddButton
            disabled={readonly}
            label="Créer une séquence"
            onClick={() => setEditing(true)}
          />
        }
      />
      <p className="alert info">
        Envoi du lundi au vendredi, entre 9 h et 17 h dans le fuseau de la
        séquence. Chaque inscription nécessite un aperçu et votre confirmation.
        Un domaine HTTPS public et le service de suivi sont nécessaires.
      </p>
      <input
        aria-label="Rechercher une séquence"
        maxLength={200}
        placeholder="Rechercher une séquence…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
      />
      <ErrorMessage error={q.error} />
      <div className="stack">
        {q.data?.data.map((row) => (
          <article className="detail-card" key={row.id}>
            <div className="card-head">
              <h3>{str(row.name)}</h3>
              <span className="pill">
                {row.enabled ? "Active" : "En pause"}
              </span>
            </div>
            <p>
              {Array.isArray(row.steps) ? row.steps.length : 0} messages ·{" "}
              {str(row.timezone)}
            </p>
            <div className="card-actions">
              <button
                className="button small"
                disabled={readonly}
                onClick={() => setEditing(row)}
              >
                Modifier
              </button>
              <button className="button small" onClick={() => setSelected(row)}>
                Contacts et historique
              </button>
              <button
                className="button small"
                disabled={readonly || busy}
                onClick={() =>
                  void save("sequences", { enabled: !row.enabled }, row).catch(
                    () => {},
                  )
                }
              >
                {row.enabled ? "Mettre en pause" : "Activer"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {q.data?.count === 0 && <Empty title="Créez votre premier suivi" />}
      <Pagination
        page={page}
        size={25}
        total={q.data?.count ?? 0}
        busy={q.isFetching}
        onChange={setPage}
      />
      <Suppressions />
      {editing && (
        <Editor
          open
          key={editing === true ? "new" : editing.id}
          title="Séquence de suivi"
          onClose={() => setEditing(null)}
          fields={[
            { key: "name", label: "Nom", required: true },
            {
              key: "timezone",
              label: "Fuseau horaire",
              type: "select",
              options: [
                "Europe/Paris",
                "Europe/London",
                "Europe/Berlin",
                "Europe/Madrid",
                "Europe/Rome",
                "Europe/Lisbon",
                "Europe/Brussels",
                "Europe/Zurich",
                "Europe/Amsterdam",
                "Europe/Warsaw",
                "Europe/Helsinki",
                "Europe/Bucharest",
                "UTC",
              ].map((value) => ({ value, label: value })),
            },
            {
              key: "steps",
              label: "Messages et délais",
              type: "custom",
              required: true,
              render: (initial, name) => (
                <RepeatFields kind="steps" name={name} initial={initial} />
              ),
            },
          ]}
          initial={
            editing === true
              ? {
                  timezone: workspace.timezone || "Europe/Paris",
                  steps: [
                    {
                      subject: "Suite à notre échange",
                      body: "Bonjour {{display_name}},",
                      delay_days: 1,
                    },
                  ],
                }
              : editing
          }
          busy={busy}
          onSave={(values) =>
            save("sequences", values, editing === true ? undefined : editing)
          }
        />
      )}
      {selected && (
        <Modal
          open
          wide
          onClose={() => setSelected(null)}
          title={str(selected.name)}
        >
          <SequenceContacts key={selected.id} sequence={selected} />
        </Modal>
      )}
    </>
  );
}
function SequenceContacts({ sequence }: { sequence: Row }) {
  const { workspace, user, objects } = useWorkspace();
  const people = objects.find((o) => o.slug === "people");
  const cache = useQueryClient();
  const [page, setPage] = useState(0);
  const enrollments = useRows("enrollments", {
    sequence_id: sequence.id,
    size: 20,
    page,
  });
  const connections = useRows("integrations", { size: 10 });
  const accounts = (connections.data?.data ?? []).filter(
    (c) =>
      c.status === "connected" &&
      ["gmail", "outlook"].includes(str(c.provider)),
  );
  const [record, setRecord] = useState<CrmRecord | undefined>();
  const [sender, setSender] = useState("");
  const [preview, setPreview] = useState<
    { subject: string; body: string }[] | null
  >(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const readonly = workspace.role === "viewer";
  async function control(row: Row, command: string) {
    setBusy(true);
    setError("");
    try {
      await request("/api/" + workspace.id + "/sequence-enroll", "PATCH", {
        id: row.id,
        command,
      });
      await enrollments.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <h3>Inscrire un contact</h3>
      <p className="caption">
        Les messages et l’adresse sont figés à l’inscription. Modifier la
        séquence concerne les futures inscriptions. Une réponse du contact
        arrête le suivi. Une adresse exclue bloque l’envoi.
      </p>
      <RecordPicker
        name="contact"
        objectId={people?.id}
        onChange={(_, row) => {
          setRecord(row);
          setPreview(null);
        }}
      />
      <label>
        Compte d’envoi
        <select
          value={sender}
          onChange={(e) => {
            setSender(e.target.value);
            setPreview(null);
          }}
        >
          <option value="">Choisir mon compte connecté</option>
          {accounts.map((c) => (
            <option key={c.id} value={str(c.provider)}>
              {str(c.email)} · {str(c.provider)}
            </option>
          ))}
        </select>
      </label>
      <ErrorMessage error={enrollments.error || connections.error} />
      {error && <div className="alert error">{error}</div>}
      <button
        className="button"
        disabled={
          readonly || !record?.email || !sender || !sequence.enabled || busy
        }
        onClick={() => {
          setError("");
          try {
            if (!record) return;
            const steps = sequenceSteps.parse(sequence.steps);
            setPreview(steps.map((step) => sequenceMessage(step, record)));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Aperçu impossible");
          }
        }}
      >
        Préparer l’aperçu
      </button>
      {preview && record && (
        <div className="detail-card">
          <strong>Destinataire : {record.email}</strong>
          <p>
            Premier envoi au plus tôt :{" "}
            {nextSequenceDate(
              sequenceSteps.parse(sequence.steps)[0].delay_days,
              str(sequence.timezone),
            ).toLocaleString("fr-FR", { timeZone: str(sequence.timezone) })}
          </p>
          {preview.map((m, index) => (
            <div key={index}>
              <h4>
                {index + 1}. {m.subject}
              </h4>
              <p className="preserve">{m.body}</p>
            </div>
          ))}
          <p className="caption">
            Un lien de désabonnement sera ajouté à chaque message. L’arrêt prend
            effet avant le prochain envoi ; un message déjà transmis ne peut pas
            être rappelé.
          </p>
          <button
            className="button primary"
            disabled={busy || readonly}
            onClick={async () => {
              if (
                !window.confirm(
                  "Autoriser les envois planifiés à " +
                    record.email +
                    " selon cet aperçu ?",
                )
              )
                return;
              setBusy(true);
              setError("");
              try {
                await request(
                  "/api/" + workspace.id + "/sequence-enroll",
                  "POST",
                  {
                    sequence_id: sequence.id,
                    record_id: record.id,
                    provider: sender,
                    confirmed: true,
                    sequence_version: sequence.version,
                    record_version: record.version,
                  },
                );
                setPreview(null);
                await cache.invalidateQueries({
                  queryKey: ["rows", workspace.id],
                });
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Inscription impossible",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmer l’inscription et les envois
          </button>
        </div>
      )}
      <h3>Contacts inscrits</h3>
      {enrollments.data?.data.map((e) => (
        <article className="detail-card" key={e.id}>
          <div className="card-head">
            <strong>
              {str((e.record as Row | undefined)?.display_name) || "Contact"}
            </strong>
            <Badge value={e.status} />
          </div>
          <p>
            Message {Number(e.step) + 1} · prochain suivi : {date(e.next_at)}
          </p>
          {!!e.last_error && <p className="alert error">{str(e.last_error)}</p>}
          {e.user_id === user.id && !readonly && (
            <div className="card-actions">
              {e.status === "active" && (
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => void control(e, "pause")}
                >
                  Pause
                </button>
              )}
              {e.status === "paused" && (
                <button
                  className="button small"
                  disabled={busy || !sequence.enabled}
                  onClick={() => void control(e, "resume")}
                >
                  Reprendre
                </button>
              )}
              {["active", "paused"].includes(str(e.status)) && (
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => void control(e, "stop")}
                >
                  Arrêter
                </button>
              )}
            </div>
          )}
          <DeliveryHistory enrollment={e.id} />
        </article>
      ))}
      {enrollments.data?.count === 0 && <Empty title="Aucun contact inscrit" />}
      <Pagination
        page={page}
        size={20}
        total={enrollments.data?.count ?? 0}
        onChange={setPage}
        busy={enrollments.isFetching}
      />
    </div>
  );
}
function Suppressions() {
  const { workspace } = useWorkspace();
  const [page, setPage] = useState(0);
  const q = useRows("suppressions", { size: 25, page });
  const [open, setOpen] = useState(false);
  const { save, remove, busy } = useSave();
  const readonly = workspace.role === "viewer";
  return (
    <section className="detail-card">
      <div className="card-head">
        <h3>Adresses exclues de l’envoi</h3>
        <AddButton
          disabled={readonly}
          label="Exclure une adresse"
          onClick={() => setOpen(true)}
        />
      </div>
      <ErrorMessage error={q.error} />
      {q.data?.data.map((row) => (
        <div className="toolbar" key={row.id}>
          <span>
            {str(row.email)} · {str(row.reason)}
          </span>
          <button
            className="button small"
            disabled={readonly || busy}
            onClick={() => {
              if (
                window.confirm(
                  "Retirer cette exclusion ? Vérifiez que ce contact accepte de recevoir vos messages.",
                )
              )
                void remove("suppressions", row.id).catch(() => {});
            }}
          >
            Retirer
          </button>
        </div>
      ))}
      {q.data?.count === 0 && <p>Aucune adresse exclue.</p>}
      <Pagination
        page={page}
        size={25}
        total={q.data?.count ?? 0}
        busy={q.isFetching}
        onChange={setPage}
      />
      {open && (
        <Editor
          open
          title="Exclure une adresse"
          onClose={() => setOpen(false)}
          fields={[
            {
              key: "email",
              label: "Adresse email",
              type: "email",
              required: true,
            },
            { key: "reason", label: "Motif", required: true },
          ]}
          initial={{ reason: "Demande du contact" }}
          busy={busy}
          onSave={(values) => save("suppressions", values)}
        />
      )}
    </section>
  );
}

function DeliveryHistory({ enrollment }: { enrollment: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  return (
    <div>
      <button className="button small" onClick={() => setOpen(!open)}>
        {open ? "Masquer" : "Voir"} l’historique d’envoi
      </button>
      {open && (
        <DeliveryRows enrollment={enrollment} page={page} onPage={setPage} />
      )}
    </div>
  );
}
function DeliveryRows({
  enrollment,
  page,
  onPage,
}: {
  enrollment: string;
  page: number;
  onPage: (value: number) => void;
}) {
  const q = useRows("sequence_deliveries", {
    enrollment_id: enrollment,
    size: 10,
    page,
  });
  return (
    <>
      <ErrorMessage error={q.error} />
      <ul>
        {q.data?.data.map((d) => (
          <li key={d.id}>
            Message {Number(d.step) + 1} · <Badge value={d.status} /> ·{" "}
            {date(d.sent_at || d.created_at)}
          </li>
        ))}
      </ul>
      <Pagination
        page={page}
        size={10}
        total={q.data?.count ?? 0}
        busy={q.isFetching}
        onChange={onPage}
      />
    </>
  );
}
