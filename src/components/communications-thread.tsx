"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace, request } from "./data-provider";
import { Modal, ErrorMessage, str } from "./ui";
import { TemplateComposer } from "./template-composer";
import type { Row } from "@/lib/domain/types";
type Email = {
  id: string;
  label: string;
  content: string;
  occurred_at: string;
  metadata: {
    sender: string;
    recipients: string[];
    integration_id: string;
    content_complete: boolean;
  };
};
export function CommunicationsThread({
  id,
  accounts,
  onClose,
}: {
  id: string;
  accounts: Row[];
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const [cursor, setCursor] = useState("");
  const [full, setFull] = useState<
    Record<
      string,
      {
        body: string;
        content_complete: boolean;
        attachments: Array<{ name: string; size: number; mime: string; provider_id: string }>;
      }
    >
  >({});
  const [error, setError] = useState("");
  const [reply, setReply] = useState<Email | null>(null);
  const [busy, setBusy] = useState("");
  const q = useQuery({
    queryKey: ["email-thread", workspace.id, id, cursor],
    queryFn: () =>
      request<{ data: Email[]; total: number; next_cursor: string | null; partial: boolean }>(
        `/api/${workspace.id}/communications/thread?id=${id}${cursor ? "&cursor=" + cursor : ""}`,
      ),
  });
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Conversation email"
        description="Messages importés accessibles à votre compte. Le fil peut être incomplet."
      >
        <ErrorMessage error={q.error || (error ? new Error(error) : null)} />
        <div className="stack">
          {q.data?.data.map((m) => (
            <article className="detail-card" key={m.id}>
              <h3>{m.label}</h3>
              <p>
                {m.metadata.sender} → {m.metadata.recipients.join(", ")}
              </p>
              <small>{new Date(m.occurred_at).toLocaleString()}</small>
              <p className="preserve">{full[m.id]?.body ?? m.content}</p>
              {!(full[m.id]?.content_complete ?? false) && (
                <small>Contenu partiel ou aperçu.</small>
              )}
              {full[m.id]?.attachments.map((a) => (
                <p key={a.provider_id}>
                  {a.name} ({Math.ceil(a.size / 1024)} Ko){" "}
                  <a
                    className="button small"
                    href={`/api/${workspace.id}/communications/attachment?id=${m.id}&attachment=${encodeURIComponent(a.provider_id)}`}
                  >
                    Télécharger
                  </a>
                </p>
              ))}
              <div className="row-actions">
                <button
                  className="button small"
                  disabled={!!busy || workspace.role === "viewer"}
                  onClick={async () => {
                    setBusy(m.id);
                    setError("");
                    try {
                      const result = await request<{ data: (typeof full)[string] }>(
                        `/api/${workspace.id}/communications/thread`,
                        "POST",
                        { id: m.id },
                      );
                      setFull((v) => ({ ...v, [m.id]: result.data }));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Lecture impossible");
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {busy === m.id ? "Chargement…" : "Lire le contenu complet"}
                </button>
                <button
                  className="button small"
                  disabled={
                    workspace.role === "viewer" ||
                    !accounts.some((a) => a.id === m.metadata.integration_id)
                  }
                  onClick={() => setReply(m)}
                >
                  Répondre
                </button>
              </div>
            </article>
          ))}
          {q.data?.next_cursor && (
            <button className="button" onClick={() => setCursor(q.data!.next_cursor!)}>
              Messages suivants
            </button>
          )}
        </div>
      </Modal>
      {reply && (
        <TemplateComposer
          accounts={accounts.filter((a) => a.id === reply.metadata.integration_id)}
          reply={{
            id: reply.id,
            to: reply.metadata.sender.match(/<([^>]+)>/)?.[1] ?? reply.metadata.sender,
            subject: /^re:/i.test(reply.label) ? reply.label : "Re: " + reply.label,
            provider: str(accounts.find((a) => a.id === reply.metadata.integration_id)?.provider),
          }}
          onClose={() => setReply(null)}
          onSent={() => {
            setReply(null);
            setError(
              "Réponse en attente du worker. Consultez son statut dans Ask Relay ou l’historique des envois.",
            );
          }}
        />
      )}
    </>
  );
}
