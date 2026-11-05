"use client";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, Trophy, XCircle } from "lucide-react";
import { Modal } from "../ui";
import {
  defaultOpenStages,
  defaultProbabilities,
  pipelineInputSchema,
  type Pipeline,
} from "@/lib/domain/pipelines";
import styles from "./pipelines.module.css";

export type StageDraft = { key: string; label: string; probability: number; saved: boolean };
export type PipelineDraft = {
  name: string;
  stages: string[];
  labels: Record<string, string>;
  probabilities: Record<string, number>;
};

/** A stable key: the first name given to a stage, made unique within the pipeline. */
export function uniqueStageKey(label: string, taken: string[]) {
  const base = label.trim().slice(0, 72) || "Étape";
  const used = new Set(taken.map((key) => key.toLocaleLowerCase("fr")));
  if (!used.has(base.toLocaleLowerCase("fr")) && !["gagné", "perdu"].includes(base.toLowerCase()))
    return base;
  for (let index = 2; index < 100; index++) {
    const candidate = `${base} ${index}`;
    if (!used.has(candidate.toLocaleLowerCase("fr"))) return candidate;
  }
  return `${base} ${crypto.randomUUID().slice(0, 6)}`;
}

export function draftFromStages(rows: StageDraft[], name: string, won: string, lost: string) {
  const labels: Record<string, string> = {};
  const probabilities: Record<string, number> = { Gagné: 100, Perdu: 0 };
  for (const row of rows) {
    probabilities[row.key] = row.probability;
    if (row.label.trim() && row.label.trim() !== row.key) labels[row.key] = row.label.trim();
  }
  if (won.trim() && won.trim() !== "Gagné") labels["Gagné"] = won.trim();
  if (lost.trim() && lost.trim() !== "Perdu") labels["Perdu"] = lost.trim();
  return { name: name.trim(), stages: rows.map((row) => row.key), labels, probabilities };
}

export function StageEditor({
  pipeline,
  busy,
  onClose,
  onSave,
}: {
  pipeline: Pipeline | null;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: PipelineDraft, moves: Record<string, string>) => Promise<void>;
}) {
  const initialStages = pipeline?.stages?.length ? pipeline.stages : defaultOpenStages;
  const [name, setName] = useState(pipeline?.name ?? "");
  const [rows, setRows] = useState<StageDraft[]>(() =>
    initialStages.map((key) => ({
      key,
      label: pipeline?.labels?.[key] || key,
      probability: pipeline?.probabilities?.[key] ?? defaultProbabilities[key] ?? 0,
      saved: !!pipeline,
    })),
  );
  const [won, setWon] = useState(pipeline?.labels?.["Gagné"] || "Gagné");
  const [lost, setLost] = useState(pipeline?.labels?.["Perdu"] || "Perdu");
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [dragged, setDragged] = useState<number | null>(null);
  const [error, setError] = useState("");
  const removed = useMemo(
    () => (pipeline ? initialStages.filter((key) => !rows.some((row) => row.key === key)) : []),
    [initialStages, pipeline, rows],
  );

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length || from === to) return;
    setRows((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }
  function update(index: number, values: Partial<StageDraft>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...values } : row)));
  }
  function add() {
    if (rows.length >= 20) return;
    const label = "Nouvelle étape";
    const key = uniqueStageKey(
      label,
      rows.map((row) => row.key),
    );
    const last = rows.at(-1)?.probability ?? 10;
    setRows((current) => [
      ...current,
      { key, label: key, probability: Math.min(95, last + 10), saved: false },
    ]);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    // Unsaved stages take their final label as key so it reads well in exports.
    const keys: string[] = [];
    const finalRows = rows.map((row) => {
      const key = row.saved
        ? row.key
        : uniqueStageKey(row.label, [
            ...keys,
            ...rows.filter((other) => other.saved).map((other) => other.key),
          ]);
      keys.push(key);
      return { ...row, key };
    });
    const draft = draftFromStages(finalRows, name, won, lost);
    const parsed = pipelineInputSchema.safeParse(draft);
    if (!parsed.success) return setError(parsed.error.issues.map((i) => i.message).join(" "));
    const fallback = finalRows[0]?.key;
    const resolved = Object.fromEntries(
      removed.map((key) => [
        key,
        moves[key] && draft.stages.includes(moves[key]) ? moves[key] : fallback,
      ]),
    );
    try {
      await onSave(draft, resolved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={pipeline ? "Configurer le pipeline" : "Nouveau pipeline"}
      description="Glissez les étapes pour les réordonner. Les probabilités servent aux prévisions pondérées."
    >
      <form className={styles.editor} onSubmit={submit}>
        <label className={styles.nameField}>
          <span>Nom du pipeline</span>
          <input
            value={name}
            maxLength={120}
            required
            autoFocus
            placeholder="Ex. Ventes SaaS"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className={styles.stageHeader}>
          <span>Étapes en cours</span>
          <span>Probabilité</span>
        </div>
        <ol className={styles.stageList} aria-label="Étapes en cours">
          {rows.map((row, index) => (
            <li
              key={row.key}
              className={styles.stageRow}
              data-dragging={dragged === index}
              draggable
              onDragStart={(event) => {
                setDragged(index);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragged !== null && dragged !== index) {
                  move(dragged, index);
                  setDragged(index);
                }
              }}
              onDragEnd={() => setDragged(null)}
            >
              <GripVertical size={15} className={styles.grip} aria-hidden />
              <span className={styles.dot} style={{ "--stage-hue": (index * 47) % 360 } as never} />
              <input
                aria-label={`Nom de l’étape ${index + 1}`}
                value={row.label}
                maxLength={80}
                required
                onChange={(event) => update(index, { label: event.target.value })}
              />
              <span className={styles.percent}>
                <input
                  aria-label={`Probabilité de ${row.label}`}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={row.probability}
                  onChange={(event) =>
                    update(index, {
                      probability: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                    })
                  }
                />
                %
              </span>
              <span className={styles.rowActions}>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Monter"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Descendre"
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Supprimer ${row.label}`}
                  disabled={rows.length < 2}
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className={styles.addStage}
          disabled={rows.length >= 20}
          onClick={add}
        >
          <Plus size={15} /> Ajouter une étape
        </button>
        <div className={styles.stageHeader}>
          <span>Étapes finales</span>
        </div>
        <div className={styles.terminal}>
          <label>
            <Trophy size={15} className={styles.won} aria-hidden />
            <input
              aria-label="Libellé de l’étape gagnée"
              value={won}
              maxLength={80}
              onChange={(event) => setWon(event.target.value)}
            />
            <span className={styles.fixed}>100 %</span>
          </label>
          <label>
            <XCircle size={15} className={styles.lost} aria-hidden />
            <input
              aria-label="Libellé de l’étape perdue"
              value={lost}
              maxLength={80}
              onChange={(event) => setLost(event.target.value)}
            />
            <span className={styles.fixed}>0 %</span>
          </label>
        </div>
        {removed.length > 0 && (
          <div className={styles.moves}>
            <strong>Étapes supprimées</strong>
            <p>Les opportunités de ces étapes seront déplacées à l’enregistrement.</p>
            {removed.map((key) => (
              <label key={key}>
                <span>{pipeline?.labels?.[key] || key} →</span>
                <select
                  value={moves[key] ?? rows[0]?.key ?? ""}
                  onChange={(event) =>
                    setMoves((current) => ({ ...current, [key]: event.target.value }))
                  }
                >
                  {rows
                    .filter((row) => row.saved)
                    .map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.label}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        )}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button type="button" className="button" onClick={onClose}>
            Annuler
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
