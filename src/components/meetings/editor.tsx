"use client";
import { useState } from "react";
import { useSave } from "../providers/data-provider";
import { Editor, type Field } from "../ui";
import { RecordPicker } from "../records/picker";
import { type Meeting } from "@/lib/domain/meetings";
import styles from "./meetings.module.css";

export function MeetingEditor({
  meeting,
  onClose,
  onSaved,
}: {
  meeting?: Meeting;
  onClose: () => void;
  onSaved?: (meeting: import("@/lib/domain/types").Row) => void;
}) {
  const { save, busy } = useSave();
  const fields: Field[] = [
    { key: "title", label: "Titre de la réunion", required: true },
    { key: "starts_at", label: "Début", type: "datetime-local", nullable: true },
    { key: "ends_at", label: "Fin", type: "datetime-local", nullable: true },
    {
      key: "status",
      label: "État",
      type: "select",
      options: [
        { value: "scheduled", label: "Planifiée" },
        { value: "completed", label: "Terminée" },
        { value: "cancelled", label: "Annulée" },
      ],
    },
    {
      key: "join_url",
      label: "Lien Meet, Teams ou Zoom",
      placeholder: "https://meet.google.com/…",
    },
    { key: "location", label: "Lieu" },
    { key: "description", label: "Description", type: "textarea" },
    {
      key: "participants",
      label: "Participants",
      type: "custom",
      render: (initial, name) => <ParticipantInput initial={initial} name={name} />,
    },
    {
      key: "transcript",
      label: "Transcription",
      type: "custom",
      render: (initial, name) => <TranscriptInput initial={initial} name={name} />,
    },
    { key: "summary", label: "Résumé", type: "textarea" },
    ...(!meeting
      ? [
          {
            key: "private",
            label: "Réunion privée (visibilité conservée après création)",
            type: "checkbox" as const,
          },
          {
            key: "record_id",
            label: "Fiche CRM principale",
            type: "custom" as const,
            render: (initial: unknown, name: string) => (
              <RecordPicker initial={initial} name={name} />
            ),
          },
        ]
      : []),
  ];
  return (
    <Editor
      open
      onClose={onClose}
      title={meeting ? "Modifier la réunion" : "Ajouter une réunion"}
      fields={fields}
      initial={meeting ?? { status: "scheduled", private: true }}
      draftKey={meeting ? `meeting:${meeting.id}` : "meeting:new"}
      busy={busy}
      onSave={async (values) => {
        const start = values.starts_at as string | null,
          end = values.ends_at as string | null;
        if (start && end && new Date(end) <= new Date(start))
          throw new Error("La fin doit suivre le début de la réunion.");
        const saved = await save("meetings", values, meeting);
        onSaved?.(saved);
        onClose();
      }}
    />
  );
}
function ParticipantInput({ initial, name }: { initial: unknown; name: string }) {
  const [text, setText] = useState(() =>
    Array.isArray(initial)
      ? initial.map((p) => (p.email ? `${p.name} <${p.email}>` : p.name)).join("\n")
      : "",
  );
  const participants = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const pair = line.match(/^(.+?)\s*<([^>]+)>$/);
      return pair
        ? { name: pair[1].trim(), email: pair[2].trim() }
        : line.includes("@")
          ? { name: line, email: line }
          : { name: line };
    });
  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(participants)} />
      <textarea
        aria-label="Participants, un par ligne"
        rows={3}
        maxLength={42000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Marie Dupont <marie@entreprise.fr>\nAlex Martin"}
      />
      <small className={styles.muted}>
        Un nom ou une adresse email par ligne. Aucun invité ne sera contacté.
      </small>
    </div>
  );
}
export function TranscriptInput({ initial, name }: { initial: unknown; name: string }) {
  const [text, setText] = useState(typeof initial === "string" ? initial : "");
  const [error, setError] = useState("");
  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(text)} />
      <textarea
        aria-label="Texte de la transcription"
        value={text}
        maxLength={200000}
        rows={7}
        onChange={(e) => setText(e.target.value)}
        placeholder="Collez votre transcription ou importez un fichier TXT, VTT ou SRT."
      />
      <label className="button small">
        Importer TXT / VTT / SRT
        <input
          className="sr-only"
          type="file"
          aria-label="Importer une transcription"
          accept=".txt,.vtt,.srt,text/plain,text/vtt"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError("");
            try {
              if (file.size > 800000 || !/^.+\.(txt|vtt|srt)$/i.test(file.name))
                throw new Error("Choisissez un fichier TXT, VTT ou SRT de 800 Ko maximum.");
              const raw = await file.text();
              if (raw.length > 200000 || raw.includes("\u0000"))
                throw new Error("Transcription trop longue ou fichier invalide.");
              setText(raw);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
