"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import type { z } from "zod";
import { formSpec, visibleFormQuestions } from "@/lib/domain/record-studio";
import { ErrorMessage } from "../../ui";
import styles from "./studio.module.css";
export function FormView({
  name,
  spec,
  onSubmit,
  preview = false,
}: {
  name: string;
  spec: z.infer<typeof formSpec>;
  onSubmit?: (answers: Record<string, unknown>, website: string) => Promise<void>;
  preview?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || preview) return;
    setError("");
    setBusy(true);
    try {
      await onSubmit?.(
        Object.fromEntries(
          visibleFormQuestions(spec, answers).map((q) => [
            q.id,
            answers[q.id] ?? (q.type === "checkbox" ? false : ""),
          ]),
        ),
        String(new FormData(event.currentTarget).get("website") ?? ""),
      );
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className={styles.success} role="status">
        <CheckCircle2 size={36} />
        <h1>Réponse enregistrée</h1>
        <p>{spec.success_message}</p>
      </div>
    );
  return (
    <form className={styles.formView} onSubmit={submit}>
      {preview && (
        <span className={styles.previewBadge}>Aperçu · les réponses ne sont pas enregistrées</span>
      )}
      <FileText size={30} strokeWidth={1.4} />
      <h1>{name || "Formulaire sans titre"}</h1>
      {spec.description && <p>{spec.description}</p>}
      {visibleFormQuestions(spec, answers).map((q) => {
        const change = (value: unknown) =>
          setAnswers((previous) => ({ ...previous, [q.id]: value }));
        return (
          <label key={q.id} className={styles.formQuestion}>
            {q.label}
            {q.required && <span aria-hidden="true"> *</span>}
            {q.description && <small>{q.description}</small>}
            {q.type === "textarea" ? (
              <textarea
                rows={4}
                maxLength={10000}
                required={q.required}
                value={String(answers[q.id] ?? "")}
                onChange={(e) => change(e.target.value)}
              />
            ) : q.type === "select" ? (
              <select
                required={q.required}
                value={String(answers[q.id] ?? "")}
                onChange={(e) => change(e.target.value)}
              >
                <option value="">Sélectionner une réponse…</option>
                {q.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : q.type === "checkbox" ? (
              <span className={styles.check}>
                <input
                  type="checkbox"
                  required={q.required}
                  checked={answers[q.id] === true}
                  onChange={(e) => change(e.target.checked)}
                />{" "}
                Oui
              </span>
            ) : (
              <input
                type={q.type}
                maxLength={q.property === "display_name" || q.property === "domain" ? 200 : 10000}
                required={q.required}
                step={q.type === "number" ? "any" : undefined}
                value={String(answers[q.id] ?? "")}
                onChange={(e) =>
                  change(
                    q.type === "number" && e.target.value !== ""
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
              />
            )}
          </label>
        );
      })}
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Site personnel
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <ErrorMessage error={error ? new Error(error) : null} />
      <button className="button primary" type="submit" disabled={busy || preview}>
        {busy ? "Envoi…" : spec.submit_label}
      </button>
    </form>
  );
}
