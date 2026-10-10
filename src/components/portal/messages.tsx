"use client";
import { useRef, useState } from "react";
import { Send, LockKeyhole, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { request, confirmedRow, RequestError } from "@/lib/api/request";
import { portalDate, portalMessageSchema, type PortalDetail } from "@/lib/domain/portals";
import { PortalPagination } from "./shared";
import styles from "./portal.module.css";
export function PortalMessages({
  data,
  onPage,
  onSent,
}: {
  data: PortalDetail;
  onPage: (page: number) => void;
  onSent: () => void;
}) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const attempt = useRef<{ id: string; content: string } | null>(null);
  async function submit() {
    if (sending.current) return;
    const parsed = portalMessageSchema.safeParse({ content });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (!attempt.current || attempt.current.content !== parsed.data.content)
      attempt.current = { id: crypto.randomUUID(), content: parsed.data.content };
    const current = attempt.current;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await request<{ data: { id: string } }>(
        "/api/portal/" + data.portal.id,
        "POST",
        { content: current.content },
        { idempotencyKey: current.id },
      );
      confirmedRow(response.data, current.id);
      setContent("");
      attempt.current = null;
      toast.success("Message envoyé.");
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Le message n’a pas été confirmé.");
      if (e instanceof RequestError && [401, 403].includes(e.status)) onSent();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.messages}>
      <header className={styles.sectionHeading}>
        <div>
          <h2>Échanges</h2>
          <p>Une conversation partagée avec les participants de ce portail.</p>
        </div>
        <span>{data.comments_count} messages</span>
      </header>
      <div className={styles.messageList}>
        {[...data.comments].reverse().map((comment) => (
          <article key={comment.id} className={styles.message} data-own={comment.own}>
            <span className={styles.messageAvatar}>{comment.own ? "V" : "P"}</span>
            <div>
              <header>
                <strong>{comment.own ? "Vous" : "Participant du portail"}</strong>
                <time dateTime={comment.created_at}>{portalDate(comment.created_at, true)}</time>
              </header>
              <p>{comment.content}</p>
            </div>
          </article>
        ))}
        {!data.comments.length && (
          <div className={styles.inlineEmpty}>
            <MessageSquare size={22} />
            <h3>Gardez tous vos échanges ici</h3>
            <p>
              {data.can_comment
                ? "Posez une question ou partagez une précision sur votre projet."
                : "Les messages partagés apparaîtront dans cet espace."}
            </p>
          </div>
        )}
      </div>
      {data.comments_count > 25 && (
        <PortalPagination
          page={data.comments_page}
          count={data.comments_count}
          size={25}
          label="messages, du plus récent au plus ancien"
          onPage={onPage}
        />
      )}
      {data.can_comment ? (
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="portal-message">Votre message</label>
          <textarea
            id="portal-message"
            placeholder="Écrivez à propos de votre projet…"
            maxLength={5000}
            rows={4}
            value={content}
            disabled={busy}
            onChange={(e) => setContent(e.target.value)}
          />
          <footer>
            <span>{content.length} / 5 000</span>
            <button className="button primary" disabled={busy || !content.trim()}>
              <Send size={14} />
              {busy ? "Envoi…" : "Envoyer le message"}
            </button>
          </footer>
          {error && (
            <p role="alert" className={styles.formError}>
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className={styles.readOnly}>
          <LockKeyhole size={14} />
          Votre accès permet de consulter les échanges. Contactez votre interlocuteur pour pouvoir
          écrire.
        </div>
      )}
    </section>
  );
}
