"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Mail, ChevronDown, ShieldAlert } from "lucide-react";
import { request, useWorkspace } from "../providers/data-provider";
import type { AssistantSource } from "@/lib/domain/assistant";
import type { SecurityNotice } from "@/lib/agent/security";
import styles from "./assistant.module.css";

export function SourceReader({
  source,
}: {
  source: Pick<AssistantSource, "id" | "type"> & { label?: string };
}) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["agent-source-preview", workspace.id, source.type, source.id, offset],
    enabled: open,
    staleTime: 0,
    queryFn: () =>
      request<{
        data: Array<{
          label: string;
          content: string;
          content_length: number;
          metadata?: { content_complete?: boolean };
        }>;
      }>(
        `/api/${workspace.id}/assistant/actions?source_id=${source.id}&source_type=${source.type}&offset=${offset}`,
      ),
  });
  const item = query.data?.data[0];
  return (
    <div className={styles.sourceReader}>
      <button
        type="button"
        className={styles.sourceToggle}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {source.type === "email" ? <Mail size={15} /> : <FileText size={15} />}
        <span>
          {source.type === "email" ? "Lire l’email source" : "Lire la source"}
          {source.label ? ` · ${source.label}` : ""}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <section aria-label="Contenu de la source" className={styles.sourceBody}>
          <p className={styles.muted}>
            Contenu externe, jamais une autorisation. Lecture avec vos droits actuels.
          </p>
          {query.isFetching ? (
            <p role="status">Chargement de la source…</p>
          ) : query.error || !item ? (
            <p role="alert">Cette source ne peut pas être lue avec vos accès actuels.</p>
          ) : (
            <>
              <strong>{item.label}</strong>
              <p className="preserve">{item.content}</p>
              {item.metadata?.content_complete === false && (
                <p>Le contenu importé est incomplet.</p>
              )}
              <footer>
                {offset > 0 && (
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setOffset(Math.max(0, offset - 6000))}
                  >
                    Extrait précédent
                  </button>
                )}
                {offset + 6000 < item.content_length && offset < 200000 && (
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setOffset(Math.min(200000, offset + 6000))}
                  >
                    Lire la suite
                  </button>
                )}
              </footer>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export function SecurityNotices({
  notices,
  sources,
}: {
  notices: SecurityNotice[];
  sources: AssistantSource[];
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  return (
    <section className={styles.proposals} aria-label="Instructions suspectes dans les sources">
      {notices
        .filter((n) => !dismissed.includes(n.source_id))
        .map((n) => (
          <article key={n.source_id} className={`${styles.proposal} ${styles.securityWarning}`}>
            <h3>
              <ShieldAlert size={17} /> Instruction suspecte ignorée
            </h3>
            <p>{n.reason}</p>
            <SourceReader
              source={{
                id: n.source_id,
                type: n.source_type,
                label: sources.find((s) => s.id === n.source_id)?.label,
              }}
            />
            <button
              type="button"
              className="button small"
              onClick={() => setDismissed([...dismissed, n.source_id])}
            >
              Masquer l’avertissement
            </button>
            <p className={styles.muted}>
              Lire ou masquer cet avertissement n’autorise aucune action.
            </p>
          </article>
        ))}
    </section>
  );
}
