"use client";
import { AgentActions } from "./actions";
import { SecurityNotices } from "./source-reader";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Copy,
  RotateCcw,
  Sparkles,
  LoaderCircle,
  FileText,
  Video,
  Building2,
  ArrowUpRight,
  TriangleAlert,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import type { AssistantMessage, AssistantSource, AssistantStep } from "@/lib/domain/assistant";
import { useWorkspace } from "../data-provider";
import styles from "./assistant.module.css";

function sourceHref(
  source: AssistantSource,
  objects: { id: string; slug: string; standard: boolean }[],
  workspace: string,
) {
  const destinations: Record<string, string> = {
    email: "communications",
    calendar: "communications",
    task: "tasks",
    commitment: "commitments",
    conflict: "conflicts",
    list: "lists",
    pipeline: "reports",
    workflow: "workflows",
  };
  if (source.type === "document") return `/api/${workspace}/files?id=${source.id}`;
  if (destinations[source.type])
    return `/app/${destinations[source.type]}?focus=${source.id}&workspace=${workspace}`;
  if (source.type === "note" || source.type === "meeting")
    return `/app/${source.type === "note" ? "notes" : "meetings"}?focus=${source.id}&workspace=${workspace}`;
  const object = objects.find((o) => o.id === source.object_id);
  return object
    ? `/app/${object.standard ? object.slug : "object-" + object.slug}?record=${source.id}&workspace=${workspace}`
    : `/app/search?q=${encodeURIComponent(source.label)}&workspace=${workspace}`;
}
function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, i) =>
      part.startsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}
function Answer({ text }: { text: string }) {
  return (
    <div className={styles.answer}>
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-*•]\s+/.test(line)))
          return (
            <ul key={i}>
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line)))
          return (
            <ol key={i}>
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>
              ))}
            </ol>
          );
        if (/^#{1,3}\s/.test(block))
          return <h3 key={i}>{inline(block.replace(/^#{1,3}\s/, ""))}</h3>;
        return <p key={i}>{inline(block)}</p>;
      })}
    </div>
  );
}
export function AgentActivity({
  steps,
  active,
  elapsed,
}: {
  steps: AssistantStep[];
  active: boolean;
  elapsed?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const detailsId = useId();
  useEffect(() => {
    if (!active) return;
    const started = performance.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((performance.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [active]);
  const running = steps.find((s) => s.status === "running");
  const failed = steps.some((s) => s.status === "error");
  const duration = elapsed ? Math.round(elapsed / 1000) : active ? seconds : 0;
  return (
    <div className={styles.activity} data-active={active}>
      <button
        type="button"
        className={styles.activityToggle}
        aria-expanded={expanded}
        aria-controls={expanded ? detailsId : undefined}
        aria-label={
          active
            ? "Analyse en cours : afficher ou masquer les recherches"
            : "Afficher ou masquer l’activité de l’assistant"
        }
        onClick={() => setExpanded(!expanded)}
      >
        {active ? (
          <LoaderCircle size={14} className={styles.spin} />
        ) : failed ? (
          <TriangleAlert size={14} />
        ) : (
          <Check size={14} />
        )}
        <span className={active ? styles.thinking : undefined}>
          {active
            ? "Thinking"
            : failed
              ? "Activité interrompue"
              : `${steps.length} étape${steps.length > 1 ? "s" : ""} effectuée${steps.length > 1 ? "s" : ""}`}
        </span>
        {active && running && <span className={styles.currentStep}>{running.label}</span>}
        {duration > 0 && <small>{duration} s</small>}
        <ChevronDown size={14} className={expanded ? styles.rotated : ""} />
      </button>
      {expanded && (
        <ol className={styles.steps} id={detailsId}>
          {steps.map((s) => (
            <li key={s.id} data-state={s.status}>
              <span className={styles.stepIcon}>
                {s.status === "running" ? (
                  <LoaderCircle size={12} className={styles.spin} />
                ) : s.status === "error" ? (
                  <TriangleAlert size={12} />
                ) : (
                  <Check size={12} />
                )}
              </span>
              <div>
                <strong>{s.label}</strong>
                {s.detail && <p>{s.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
export function ChatMessage({
  message,
  busy,
  onRetry,
  onEdit,
}: {
  message: AssistantMessage;
  busy: boolean;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const { workspace, objects } = useWorkspace();
  const active = message.state === "pending" && busy;
  if (message.role === "user")
    return (
      <article className={styles.userMessage}>
        <span className={styles.userLabel}>Vous</span>
        <div>{message.content}</div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Modifier et relancer dans une nouvelle conversation"
          title="Modifier dans une nouvelle conversation"
          disabled={busy}
          onClick={onEdit}
        >
          <Pencil size={13} />
        </button>
      </article>
    );
  return (
    <article className={styles.agentMessage}>
      <div className={styles.agentHeading}>
        <span className={styles.agentMark}>
          <Sparkles size={15} />
        </span>
        <strong>Ask Relay</strong>
        <span>Assistant IA · OpenAI</span>
      </div>
      {((message.steps?.length ?? 0) > 0 || active) && (
        <AgentActivity steps={message.steps ?? []} active={active} elapsed={message.elapsed_ms} />
      )}
      {message.answer ? (
        <Answer text={message.answer} />
      ) : !active ? (
        <p className={styles.muted}>Cette réponse n’a pas été terminée. Relancez la question.</p>
      ) : null}
      {!!message.sources?.length && !active && (
        <div className={styles.sources}>
          <span>Sources</span>
          {message.sources.map((source) => {
            const Icon =
              source.type === "note" ? FileText : source.type === "meeting" ? Video : Building2;
            return (
              <Link
                key={source.id}
                href={sourceHref(source, objects, workspace.id)}
                className={styles.source}
              >
                <Icon size={13} />
                <span>{source.label}</span>
                <ArrowUpRight size={11} />
              </Link>
            );
          })}
        </div>
      )}
      {!active && !!message.security_notices?.length && (
        <SecurityNotices notices={message.security_notices} sources={message.sources ?? []} />
      )}
      {!active && !!message.actions?.length && (
        <AgentActions actions={message.actions} sources={message.sources} />
      )}
      {!active && !!message.citations?.length && (
        <section className={styles.proposals} aria-label="Citations vérifiées">
          {message.citations.map((citation, index) => {
            const source = message.sources?.find((s) => s.id === citation.source_id);
            return source ? (
              <article className={styles.proposal} key={index}>
                <blockquote>{citation.quote}</blockquote>
                <Link href={sourceHref(source, objects, workspace.id)}>{source.label}</Link>
              </article>
            ) : null;
          })}
        </section>
      )}
      {!active && !!message.proposals?.length && (
        <section className={styles.proposals} aria-label="Propositions à confirmer">
          <div className={styles.proposalHeading}>
            <span>À examiner</span>
            <small>
              {message.proposals.length} proposition{message.proposals.length > 1 ? "s" : ""}
            </small>
          </div>
          {message.proposals.map((p, i) => {
            const accepted = message.accepted?.[i];
            return (
              <article key={i} className={styles.proposal}>
                <span className={styles.proposalType}>
                  {p.type === "commitment" ? "Engagement proposé" : "Contradiction à clarifier"}
                </span>
                <h3>{p.title}</h3>
                <blockquote>{p.source_quote}</blockquote>
                {p.source_b_quote && <blockquote>{p.source_b_quote}</blockquote>}
                {p.uncertainty && <p>{p.uncertainty}</p>}
                <footer>
                  <span>
                    Votre confirmation est nécessaire. Les propositions issues de sources privées
                    restent privées.
                  </span>
                  {accepted ? (
                    <Link
                      className="button small"
                      href={`/app/${accepted.resource}?focus=${accepted.id}&workspace=${workspace.id}`}
                    >
                      <Check size={13} />
                      Ouvrir
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="button small"
                      disabled={busy}
                      onClick={onRetry}
                    >
                      <RotateCcw size={13} />
                      Actualiser l’analyse pour préparer un aperçu
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </section>
      )}
      {!active && (
        <div className={styles.messageActions}>
          <button
            type="button"
            aria-label="Copier la réponse"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message.answer || "");
                toast.success("Réponse copiée");
              } catch {
                toast.error("La copie est indisponible dans ce navigateur.");
              }
            }}
          >
            <Copy size={13} />
            Copier
          </button>
          <button type="button" disabled={busy} onClick={onRetry}>
            <RotateCcw size={13} />
            Réessayer
          </button>
          {message.model && <span>{message.model}</span>}
        </div>
      )}
    </article>
  );
}
