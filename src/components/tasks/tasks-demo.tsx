"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { SegmentedControl, Select } from "../ui/coss";
import { TaskDialog, TaskRow } from "./tasks-page";
import type { Row } from "@/lib/domain/types";
import styles from "./tasks.module.css";

const day = (offset: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const members = [
  { value: "u1", label: "Alex Laurent" },
  { value: "u2", label: "Morgan Colin" },
];
const sample = (): Row[] =>
  [
    {
      id: "t1",
      title: "Envoyer le devis signé",
      description: "Version avec la remise de 8 % validée mardi.",
      due_date: day(-1),
      status: "open",
      priority: "high",
      owner_id: "u1",
      record_id: "r1",
      record: { display_name: "Studio Rivage" },
    },
    {
      id: "t2",
      title: "Préparer la démo produit",
      due_date: day(0, 15),
      status: "in_progress",
      priority: "normal",
      owner_id: "u2",
      record_id: "r2",
      record: { display_name: "Maison Atlas" },
    },
    {
      id: "t3",
      title: "Relancer après le webinaire",
      due_date: day(3),
      status: "open",
      priority: "low",
      owner_id: "u1",
    },
    {
      id: "t4",
      title: "Mettre à jour la fiche contact",
      due_date: day(-4),
      status: "done",
      priority: "normal",
      owner_id: "u2",
    },
  ] as unknown as Row[];

/** Interactive Tasks page preview for the component gallery, with local sample data. */
export function TasksDemo({ onMessage }: { onMessage: (message: string) => void }) {
  const [rows, setRows] = useState(sample);
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [editor, setEditor] = useState<Row | true | null>(null);
  const visible = rows.filter(
    (row) => (!status || row.status === status) && (!owner || row.owner_id === owner),
  );
  return (
    <div>
      <div className={styles.toolbar}>
        <SegmentedControl
          aria-label="Filtrer le statut"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: "", label: "Toutes" },
            { value: "open", label: "À traiter" },
            { value: "in_progress", label: "En cours" },
            { value: "done", label: "Réalisé" },
          ]}
        />
        <div className={styles.filters}>
          <Select
            aria-label="Filtrer le responsable"
            size="sm"
            className={styles.filterSelect}
            value={owner}
            onValueChange={setOwner}
            options={[{ value: "", label: "Toute l’équipe" }, ...members]}
          />
          <button className="button primary" onClick={() => setEditor(true)}>
            <Plus size={15} />
            Nouvelle tâche
          </button>
        </div>
      </div>
      <section className={styles.list} aria-label="Tâches de démonstration">
        <div className={styles.listHead}>
          <span>{visible.length} tâches</span>
        </div>
        {visible.map((row) => (
          <TaskRow
            key={row.id}
            row={row}
            ownerName={members.find((m) => m.value === row.owner_id)?.label ?? ""}
            readOnly={false}
            busy={false}
            onDoneChange={(done) =>
              setRows((all) =>
                all.map((r) => (r.id === row.id ? { ...r, status: done ? "done" : "open" } : r)),
              )
            }
            onEdit={() => setEditor(row)}
            onDelete={() => setRows((all) => all.filter((r) => r.id !== row.id))}
          />
        ))}
      </section>
      {editor && (
        <TaskDialog
          key={editor === true ? "new" : editor.id}
          task={editor === true ? null : editor}
          members={members}
          busy={false}
          linkRecord={false}
          onClose={() => setEditor(null)}
          onSave={async (values) => {
            setRows((all) =>
              editor === true
                ? [{ id: "t" + Date.now(), ...values } as unknown as Row, ...all]
                : all.map((r) => (r.id === editor.id ? ({ ...r, ...values } as Row) : r)),
            );
            onMessage(editor === true ? "Tâche ajoutée à l’aperçu" : "Tâche mise à jour");
          }}
        />
      )}
    </div>
  );
}
