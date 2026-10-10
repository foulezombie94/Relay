"use client";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Square, Slash, Search, Check, X, Layers3 } from "lucide-react";
import { assistantPrompts } from "@/lib/domain/assistant";
import type { CrmRecord } from "@/lib/domain/types";
import { request, useWorkspace } from "../providers/data-provider";
import styles from "./assistant.module.css";

export type RecordContext = { id: string; label: string } | null;
export function AssistantComposer({
  message,
  setMessage,
  context,
  setContext,
  busy,
  configured,
  model,
  deepen,
  setDeepen,
  placement,
  onSend,
  onStop,
}: {
  message: string;
  setMessage: (value: string) => void;
  context: RecordContext;
  setContext: (value: RecordContext) => void;
  busy: boolean;
  configured: boolean;
  model: string;
  deepen: boolean;
  setDeepen: (value: boolean) => void;
  placement: "top" | "bottom";
  onSend: () => void;
  onStop: () => void;
}) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  const [prompts, setPrompts] = useState(false);
  const [options, setOptions] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    const el = textarea.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [message]);
  const records = useQuery({
    queryKey: ["assistant-context", workspace.id, query],
    enabled: open,
    queryFn: () =>
      request<{ data: CrmRecord[] }>(
        `/api/${workspace.id}/records?size=30&q=${encodeURIComponent(query)}`,
      ),
  });
  function choosePrompt(prompt: string) {
    setMessage(prompt);
    setPrompts(false);
    textarea.current?.focus();
  }
  return (
    <div className={styles.composerArea} data-placement={placement}>
      {(prompts || message.startsWith("/")) && (
        <div className={styles.promptMenu}>
          <div>
            <strong>Raccourcis de l’assistant</strong>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Fermer les raccourcis"
              onClick={() => {
                setPrompts(false);
                if (message.startsWith("/")) setMessage(message.slice(1));
              }}
            >
              <X size={14} />
            </button>
          </div>
          {assistantPrompts.map((p) => (
            <button type="button" key={p.title} onClick={() => choosePrompt(p.prompt)}>
              <span>{p.title}</span>
              <small>{p.description}</small>
            </button>
          ))}
        </div>
      )}
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && configured && message.trim()) onSend();
        }}
      >
        {context && (
          <div className={styles.contextChip}>
            <Layers3 size={13} />
            <span>{context.label}</span>
            <button
              type="button"
              disabled={busy}
              aria-label="Retirer la fiche du contexte"
              onClick={() => setContext(null)}
            >
              <X size={12} />
            </button>
          </div>
        )}
        <textarea
          ref={textarea}
          aria-label="Message à l’assistant"
          value={message}
          maxLength={4000}
          disabled={busy}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (message.trim() && configured && !busy) onSend();
            }
          }}
          placeholder={
            context ? `Posez une question sur ${context.label}…` : "Posez votre question…"
          }
          rows={2}
        />
        <div className={styles.composerToolbar}>
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Anchor asChild>
              <span className={styles.contextAnchor} aria-hidden="true" />
            </Popover.Anchor>
            <Popover.Portal>
              <Popover.Content
                className={styles.contextMenu}
                align="start"
                side={placement === "top" ? "bottom" : "top"}
                sideOffset={12}
                onCloseAutoFocus={(e) => {
                  e.preventDefault();
                  textarea.current?.focus();
                }}
              >
                <div className={styles.contextSearch}>
                  <Search size={14} />
                  <input
                    aria-label="Rechercher une fiche"
                    placeholder="Rechercher dans votre CRM…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setContext(null);
                    setOpen(false);
                  }}
                >
                  <Layers3 size={15} />
                  <span>Contexte récent de l’espace</span>
                  {!context && <Check size={13} />}
                </button>
                {records.isPending ? (
                  <p>Chargement des fiches…</p>
                ) : records.error ? (
                  <p>{records.error.message}</p>
                ) : !records.data?.data.length ? (
                  <p>Aucune fiche trouvée.</p>
                ) : (
                  records.data.data.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => {
                        setContext({ id: r.id, label: r.display_name });
                        setOpen(false);
                        textarea.current?.focus();
                      }}
                    >
                      <span className={styles.recordInitial}>{r.display_name.slice(0, 1)}</span>
                      <span>{r.display_name}</span>
                      {context?.id === r.id && <Check size={13} />}
                    </button>
                  ))
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button
            type="button"
            className={styles.iconButton}
            disabled={busy}
            aria-label="Utiliser un raccourci"
            title="Raccourcis /"
            onClick={() => setPrompts(!prompts)}
          >
            <Slash size={10} className={styles.slashKey} />
          </button>
          <Popover.Root open={options} onOpenChange={setOptions}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className={styles.model}
                disabled={busy}
                aria-label="Options de recherche et modèle"
                title={`Modèle configuré : ${model || "non configuré"}`}
              >
                {deepen ? "Approfondir" : "Auto"}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className={styles.searchOptions}
                align="end"
                side={placement === "top" ? "bottom" : "top"}
                sideOffset={12}
              >
                <strong>Recherche dans votre CRM</strong>
                <p>Zyliad choisit les sources utiles à votre demande.</p>
                <button
                  type="button"
                  className={styles.optionsContext}
                  disabled={busy}
                  onClick={() => {
                    setOptions(false);
                    setOpen(true);
                  }}
                >
                  <Layers3 size={14} />
                  {context ? "Changer de fiche" : "Ajouter une fiche"}
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={deepen}
                    disabled={busy}
                    onChange={(e) => setDeepen(e.target.checked)}
                  />
                  <span>
                    Approfondir la recherche
                    <small>Autorise davantage de recherches pour cette réponse.</small>
                  </span>
                </label>
                <footer>
                  Assistant IA de Zyliad · OpenAI
                  <br />
                  Modèle : {model || "non configuré"}
                </footer>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {busy ? (
            <button
              type="button"
              className={styles.send}
              aria-label="Arrêter la réponse"
              title="Arrêter la réponse"
              onClick={onStop}
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className={styles.send}
              disabled={!message.trim() || !configured}
              aria-label="Envoyer le message"
            >
              <ArrowUp size={14} />
            </button>
          )}
        </div>
      </form>
      <div className={styles.composerNote}>
        <span>Zyliad peut se tromper. Vérifiez les sources.</span>
        <span>Entrée pour envoyer · ⇧ Entrée pour une ligne</span>
      </div>
    </div>
  );
}
