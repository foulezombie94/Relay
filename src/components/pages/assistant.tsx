"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  Plus,
  Search,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  LockKeyhole,
  Pencil,
  Trash2,
  Copy,
  ArrowUpRight,
  FileText,
  Video,
  Handshake,
  ScanLine,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, request } from "../data-provider";
import { Modal } from "../ui";
import { AssistantComposer, type RecordContext } from "../assistant/composer";
import { ChatMessage } from "../assistant/message";
import { readAssistantStream } from "../assistant/stream";
import {
  assistantPrompts,
  type AssistantConversation,
  type AssistantMessage,
} from "@/lib/domain/assistant";
import styles from "../assistant/assistant.module.css";

type AssistantStatus = {
  configured: boolean;
  model: string;
  conversations: Omit<AssistantConversation, "messages">[];
};
export function AssistantPage() {
  const { workspace, user } = useWorkspace();
  return <AssistantSession key={workspace.id + user.id} />;
}
function AssistantSession() {
  const { workspace } = useWorkspace();
  const url = useSearchParams();
  const endpoint = `/api/${workspace.id}/assistant`;
  const status = useQuery({
    queryKey: ["assistant-status", workspace.id],
    queryFn: () => request<AssistantStatus>(endpoint),
  });
  const [messages, setMessages] = useState<AssistantMessage[]>([]),
    [conversation, setConversation] = useState("");
  const [title, setTitle] = useState("Nouvelle conversation"),
    [message, setMessage] = useState("");
  const [context, setContext] = useState<RecordContext>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [deepen, setDeepen] = useState(false);
  const [search, setSearch] = useState(""),
    [historyOpen, setHistoryOpen] = useState<boolean | "auto">("auto");
  const [rename, setRename] = useState(false),
    [newTitle, setNewTitle] = useState(""),
    [remove, setRemove] = useState(false),
    [editing, setEditing] = useState(false);
  const active = useRef<AbortController | null>(null),
    readVersion = useRef(0),
    scroll = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      readVersion.current++;
    },
    [],
  );
  function toggleHistory() {
    setHistoryOpen((current) => (current === "auto" ? window.innerWidth < 900 : !current));
  }
  const recordFromUrl = url.get("record");
  useEffect(() => {
    if (!recordFromUrl || !/^[\da-f-]{36}$/i.test(recordFromUrl)) return;
    let mounted = true;
    request<{ data: { id: string; display_name: string }[] }>(
      `/api/${workspace.id}/records?id=${recordFromUrl}`,
    )
      .then((r) => {
        if (mounted && r.data[0]) setContext({ id: r.data[0].id, label: r.data[0].display_name });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [recordFromUrl, workspace.id]);
  useEffect(() => {
    const element = scroll.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 350)
      element.scrollTop = element.scrollHeight;
  }, [messages]);
  function newChat() {
    readVersion.current++;
    setLoading(false);
    setMessages([]);
    setConversation("");
    setTitle("Nouvelle conversation");
    setMessage("");
    setError("");
  }
  async function openChat(id: string) {
    if (busy) return;
    const version = ++readVersion.current;
    setLoading(true);
    setError("");
    try {
      const result = await request<{ data: AssistantConversation }>(endpoint + "?id=" + id);
      if (version !== readVersion.current) return;
      setConversation(id);
      setTitle(result.data.title);
      setMessages(result.data.messages);
      setMessage("");
      const record = result.data.messages.findLast((m) => m.role === "user")?.record_id;
      const source = result.data.messages
        .flatMap((m) => m.sources ?? [])
        .find((s) => s.type === "record" && s.id === record);
      setContext(record ? { id: record, label: source?.label || "Fiche sélectionnée" } : null);
      if (record && !source) {
        const lookup = await request<{ data: { id: string; display_name: string }[] }>(
          `/api/${workspace.id}/records?id=${record}`,
        );
        if (version === readVersion.current && lookup.data[0])
          setContext({ id: record, label: lookup.data[0].display_name });
      }
      if (window.innerWidth < 900) setHistoryOpen(false);
      requestAnimationFrame(() => {
        if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
      });
    } catch (e) {
      if (version === readVersion.current)
        setError(e instanceof Error ? e.message : "Conversation inaccessible");
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }
  async function ask(text = message, scope = context, requestKey?: string) {
    if (active.current || !text.trim() || !status.data?.configured || loading) return;
    const abort = new AbortController();
    active.current = abort;
    setBusy(true);
    setError("");
    setMessage("");
    const user: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      request_id: requestKey ?? crypto.randomUUID(),
      record_id: scope?.id,
    };
    const placeholder: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      state: "pending",
      steps: [],
    };
    const base = messages;
    setMessages([...base, user, placeholder]);
    let acceptedByServer = false;
    const update = (change: (m: AssistantMessage) => AssistantMessage) =>
      setMessages((current) => current.map((m, i) => (i === current.length - 1 ? change(m) : m)));
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ask",
          deepen,
          message: text.trim(),
          request_id: user.request_id,
          ...(conversation ? { conversation_id: conversation } : {}),
          ...(scope ? { record_id: scope.id } : {}),
        }),
        signal: abort.signal,
      });
      await readAssistantStream(response, (event) => {
        if (event.type === "conversation") {
          acceptedByServer = true;
          setConversation(event.id);
          setTitle(event.title);
          setMessages([...base, event.user, { ...placeholder, id: event.message_id }]);
        }
        if (event.type === "step")
          update((m) => ({
            ...m,
            steps: [...(m.steps ?? []).filter((s) => s.id !== event.step.id), event.step],
          }));
        if (event.type === "text") update((m) => ({ ...m, answer: event.text }));
        if (event.type === "complete") update(() => event.message);
        if (event.type === "error") {
          setError(event.error);
          update((m) => ({
            ...m,
            state: "error",
            answer: event.error,
            sources: [],
            proposals: [],
          }));
        }
      });
    } catch (e) {
      if (!acceptedByServer) {
        setMessages(base);
        setMessage(text);
      }
      const description = abort.signal.aborted
        ? "Réponse arrêtée. Vous pouvez relancer la question."
        : e instanceof Error
          ? e.message
          : "Assistant indisponible";
      setError(abort.signal.aborted ? "" : description);
      if (acceptedByServer)
        update((m) => ({
          ...m,
          state: abort.signal.aborted ? "stopped" : "error",
          answer: description,
          proposals: [],
          sources: [],
          steps: m.steps?.map((s) =>
            s.status === "running" ? { ...s, status: "error", detail: description } : s,
          ),
        }));
    } finally {
      active.current = null;
      setBusy(false);
      void status.refetch();
    }
  }
  const conversations = (status.data?.conversations ?? []).filter((c) =>
    c.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const icons = [FileText, Video, Handshake, ScanLine];
  return (
    <section className={styles.layout} data-history={historyOpen} aria-label="Ask Relay">
      <aside className={styles.history} aria-label="Historique privé">
        <div className={styles.historyHeading}>
          <span>
            <Sparkles size={15} />
            Ask Relay
          </span>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Masquer l’historique"
            onClick={() => setHistoryOpen(false)}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        <button type="button" className={styles.newChat} disabled={busy} onClick={newChat}>
          <Plus size={16} />
          Nouvelle conversation
        </button>
        <label className={styles.historySearch}>
          <Search size={14} />
          <input
            aria-label="Rechercher une conversation"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span className={styles.historyLabel}>Conversations récentes</span>
        <div className={styles.historyList}>
          {status.isPending ? (
            <p>Chargement…</p>
          ) : !conversations.length ? (
            <div className={styles.historyEmpty}>
              <MessageSquare size={20} />
              <p>{search ? "Aucun résultat." : "Vos conversations apparaîtront ici."}</p>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                type="button"
                key={c.id}
                aria-current={conversation === c.id ? "page" : undefined}
                disabled={busy}
                onClick={() => void openChat(c.id)}
              >
                <MessageSquare size={14} />
                <span>
                  <strong>{c.title}</strong>
                  <small>
                    {new Date(c.updated_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                    })}
                  </small>
                </span>
              </button>
            ))
          )}
        </div>
        <div className={styles.historyFooter}>
          <LockKeyhole size={13} />
          <span>
            Conversations privées
            <br />
            <small>Visibles uniquement par vous</small>
          </span>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Afficher ou masquer l’historique"
            onClick={toggleHistory}
          >
            <PanelLeftOpen size={17} />
          </button>
          <div>
            <span>Assistant IA officiel de Relay · OpenAI</span>
            <button
              type="button"
              className={styles.chatTitle}
              disabled={!conversation || busy}
              title="Renommer la conversation"
              onClick={() => {
                setNewTitle(title);
                setRename(true);
              }}
            >
              {title}
              {conversation && <Pencil size={12} />}
            </button>
          </div>
          <div className={styles.headerActions}>
            {conversation && (
              <>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="Copier l’identifiant de conversation"
                  title="Copier l’identifiant"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(conversation);
                      toast.success("Identifiant copié");
                    } catch {
                      toast.error("Copie indisponible");
                    }
                  }}
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="Supprimer cette conversation"
                  title="Supprimer la conversation"
                  disabled={busy}
                  onClick={() => setRemove(true)}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <Link href="/doc?article=assistant" className={styles.help}>
              Guide
              <ArrowUpRight size={12} />
            </Link>
          </div>
        </header>
        <div
          ref={scroll}
          className={styles.thread}
          role="log"
          aria-label="Conversation"
          aria-busy={busy || loading}
        >
          {status.error && (
            <div className="alert error">
              {status.error.message}
              <button type="button" className="button small" onClick={() => void status.refetch()}>
                Réessayer
              </button>
            </div>
          )}
          {status.data && !status.data.configured && (
            <div className={styles.configuration}>
              <Sparkles size={16} />
              <div>
                <strong>Votre assistant est prêt à être activé.</strong>
                <p>
                  Demandez à votre administrateur d’activer l’IA. Votre historique reste accessible.
                </p>
              </div>
              <Link href="/doc?article=assistant">
                Voir le guide
                <ArrowUpRight size={12} />
              </Link>
            </div>
          )}
          {loading ? (
            <div className={styles.loading}>
              <LoaderCircle size={22} className={styles.spin} />
              Ouverture de la conversation…
            </div>
          ) : !messages.length ? (
            <div className={styles.welcome}>
              <span className={styles.welcomeMark}>
                <Sparkles size={26} />
              </span>
              <span className={styles.eyebrow}>Votre contexte, votre prochaine action.</span>
              <h1>
                Qu’aimeriez-vous
                <br />
                éclaircir aujourd’hui ?
              </h1>
              <p>
                Faites le point sur un client, préparez un rendez-vous
                <br className={styles.desktopBreak} /> ou retrouvez les engagements dans vos
                échanges.
              </p>
              <div className={styles.promptGrid}>
                {assistantPrompts.map((p, i) => {
                  const Icon = icons[i];
                  return (
                    <button
                      type="button"
                      key={p.title}
                      disabled={busy || !status.data?.configured}
                      onClick={() => setMessage(p.prompt)}
                    >
                      <Icon size={18} />
                      <strong>{p.title}</strong>
                      <span>{p.description}</span>
                      <ArrowUpRight size={13} />
                    </button>
                  );
                })}
              </div>
              <div className={styles.welcomeTrust}>
                <LockKeyhole size={12} />
                L’assistant respecte vos accès aux données.
              </div>
            </div>
          ) : (
            <div className={styles.messages}>
              {messages.map((m, i) => (
                <ChatMessage
                  key={m.id}
                  message={m}
                  busy={busy}
                  onEdit={() => {
                    newChat();
                    setMessage(m.content || "");
                    setContext(
                      m.record_id
                        ? {
                            id: m.record_id,
                            label:
                              context?.id === m.record_id ? context.label : "Fiche sélectionnée",
                          }
                        : null,
                    );
                  }}
                  onRetry={() => {
                    const user = messages.slice(0, i).findLast((item) => item.role === "user");
                    if (user?.content) {
                      const scope = user.record_id
                        ? {
                            id: user.record_id,
                            label:
                              messages
                                .flatMap((m) => m.sources ?? [])
                                .find((s) => s.type === "record" && s.id === user.record_id)
                                ?.label || "Fiche sélectionnée",
                          }
                        : null;
                      setContext(scope);
                      void ask(user.content, scope, user.request_id);
                    }
                  }}
                />
              ))}
            </div>
          )}
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
        </div>
        <label className="footer-note">
          <input
            type="checkbox"
            checked={deepen}
            disabled={busy}
            onChange={(e) => setDeepen(e.target.checked)}
          />{" "}
          Approfondir la recherche (budget étendu)
        </label>
        <AssistantComposer
          message={message}
          setMessage={setMessage}
          context={context}
          setContext={setContext}
          busy={busy}
          configured={!!status.data?.configured}
          model={status.data?.model || ""}
          onSend={() => void ask()}
          onStop={() => active.current?.abort()}
        />
      </div>
      <Modal
        open={rename}
        onClose={() => setRename(false)}
        title="Renommer la conversation"
        description="Choisissez un titre facile à retrouver."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setEditing(true);
            try {
              await request(endpoint, "PATCH", { id: conversation, title: newTitle });
              setTitle(newTitle.trim());
              setRename(false);
              await status.refetch();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Modification impossible");
            } finally {
              setEditing(false);
            }
          }}
        >
          <label>
            Titre
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <div className="dialog-actions">
            <button type="button" className="button" onClick={() => setRename(false)}>
              Annuler
            </button>
            <button className="button primary" disabled={editing || !newTitle.trim()}>
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={remove}
        onClose={() => setRemove(false)}
        title="Supprimer cette conversation ?"
        description="Les messages de cette conversation seront supprimés. Les propositions déjà ajoutées au CRM restent disponibles."
      >
        <div className="dialog-actions">
          <button type="button" className="button" onClick={() => setRemove(false)}>
            Annuler
          </button>
          <button
            type="button"
            className="button danger"
            disabled={editing}
            onClick={async () => {
              setEditing(true);
              try {
                await request(endpoint + "?id=" + conversation, "DELETE");
                setRemove(false);
                newChat();
                await status.refetch();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Suppression impossible");
              } finally {
                setEditing(false);
              }
            }}
          >
            Supprimer
          </button>
        </div>
      </Modal>
    </section>
  );
}
