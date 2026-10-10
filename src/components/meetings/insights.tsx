"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Sparkles, Square, ArrowUpRight } from "lucide-react";
import { useRows, useWorkspace } from "../providers/data-provider";
import { ErrorMessage } from "../ui";
import { request } from "@/lib/api/request";
import { readAssistantStream } from "../assistant/stream";
import { ChatMessage } from "../assistant/message";
import {
  insightPresets,
  insightQuestion,
  type InsightTemplate,
  type InsightSection,
} from "@/lib/domain/meetings";
import type { AssistantMessage } from "@/lib/domain/assistant";
import styles from "./meetings.module.css";

export function MeetingInsights({
  id,
  hasSource,
  previewSections,
}: {
  id: string;
  hasSource: boolean;
  previewSections?: InsightSection[];
}) {
  const { workspace } = useWorkspace();
  const [selected, setSelected] = useState("preset:0"),
    [answer, setAnswer] = useState<AssistantMessage | null>(null),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false),
    [conversation, setConversation] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const templates = useRows<InsightTemplate>("meeting_insight_templates", {
    status: "published",
    size: 100,
  });
  const availability = useQuery({
    queryKey: ["rows", workspace.id, "meeting-assistant-status"],
    queryFn: () => request<{ configured: boolean }>(`/api/${workspace.id}/assistant`),
    retry: false,
  });
  useEffect(() => () => active.current?.abort(), []);
  async function analyse() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setConversation(null);
    try {
      const selectedTemplate = previewSections
        ? { sections: previewSections }
        : selected.startsWith("preset:")
          ? insightPresets[Number(selected.split(":")[1])]
          : templates.data?.data.find((t) => t.id === selected);
      if (!selectedTemplate || (!previewSections && templates.isError))
        throw new Error("Le modèle n’est plus disponible. Rechargez les modèles.");
      const response = await fetch(`/api/${workspace.id}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ask",
          meeting_id: id,
          message: insightQuestion(id, selectedTemplate.sections),
          request_id: crypto.randomUUID(),
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(85000)]),
      });
      await readAssistantStream(response, (event) => {
        if (event.type === "conversation") setConversation(event.id);
        if (event.type === "complete") {
          if (
            event.message.state !== "complete" ||
            !event.message.citations?.some((c) => c.source_id === id) ||
            event.message.actions?.length
          )
            throw new Error("L’analyse de cette réunion n’a pas été confirmée.");
          setAnswer(event.message);
        }
        if (event.type === "error") throw new Error(event.error);
      });
    } catch (err) {
      setError(
        controller.signal.aborted
          ? new Error("Analyse arrêtée. Vous pouvez la relancer.")
          : (err as Error),
      );
    } finally {
      active.current = null;
      setBusy(false);
    }
  }
  return (
    <section className={styles.insights} aria-label="Analyse de la réunion">
      <div className={styles.insightTitle}>
        <span>
          <Sparkles size={17} />
        </span>
        <div>
          <h3>Insights Zyliad</h3>
          <p>Une lecture utile, appuyée sur vos échanges.</p>
        </div>
      </div>
      {!previewSections && (
        <label>
          Modèle d’analyse
          <select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={busy}>
            {insightPresets.map((p, i) => (
              <option key={p.name} value={`preset:${i}`}>
                {p.name}
              </option>
            ))}
            {!templates.isError &&
              templates.data?.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · équipe
                </option>
              ))}
          </select>
        </label>
      )}
      {!previewSections && <ErrorMessage error={templates.error} />}
      <ErrorMessage error={availability.error} />
      {!availability.isError && availability.data?.configured === false && (
        <p className={styles.notice}>
          L’assistant n’est pas encore activé. Votre administrateur peut le configurer dans les
          paramètres.
        </p>
      )}
      <button
        className="button primary"
        disabled={!hasSource || busy || availability.isError || !availability.data?.configured}
        onClick={() => void analyse()}
      >
        <Sparkles size={14} />
        {busy ? "Analyse en cours…" : answer ? "Régénérer l’analyse" : "Générer l’analyse"}
      </button>
      {busy && (
        <button className="button small" onClick={() => active.current?.abort()}>
          <Square size={12} />
          Arrêter
        </button>
      )}
      <ErrorMessage error={error} />
      {answer ? (
        <ChatMessage
          message={answer}
          busy={false}
          onRetry={() => void analyse()}
          onEdit={() => void analyse()}
        />
      ) : (
        <div className={styles.insightEmpty}>
          <FileIllustration />
          <strong>
            {hasSource
              ? "Retrouvez l’essentiel de la conversation"
              : "Ajoutez une transcription pour commencer"}
          </strong>
          <p>
            Décisions, points importants et prochaines étapes, avec les passages qui les confirment.
          </p>
        </div>
      )}
      {conversation && (
        <Link
          className="button small"
          href={`/app/assistant?conversation=${conversation}&workspace=${workspace.id}`}
        >
          Historique de l’analyse <ArrowUpRight size={13} />
        </Link>
      )}
      <small className={styles.muted}>
        Lecture seule : aucun message n’est envoyé et aucune fiche n’est modifiée. Une nouvelle
        génération utilise votre quota IA.
      </small>
    </section>
  );
}
function FileIllustration() {
  return (
    <div className={styles.illustration} aria-hidden>
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
