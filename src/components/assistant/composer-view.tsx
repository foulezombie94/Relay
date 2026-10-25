"use client";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import {
  ArrowUp,
  Square,
  Plus,
  Search,
  Check,
  X,
  Layers3,
  ShieldCheck,
  Building2,
  Users,
  Mail,
  Video,
  NotebookPen,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { assistantPrompts } from "@/lib/domain/assistant";
import type { CrmRecord } from "@/lib/domain/types";
import styles from "./assistant.module.css";

export type RecordContext = { id: string; label: string } | null;
export function AssistantComposerView({
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
  contextOpen: open,
  setContextOpen: setOpen,
  recordSearch: search,
  setRecordSearch: setSearch,
  records,
  prefetchPrivate = true,
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
  contextOpen: boolean;
  setContextOpen: (open: boolean) => void;
  recordSearch: string;
  setRecordSearch: (query: string) => void;
  records: { loading: boolean; error?: string; data: Pick<CrmRecord, "id" | "display_name">[] };
  prefetchPrivate?: boolean;
}) {
  const [adding, setAdding] = useState(false),
    [approval, setApproval] = useState(false),
    [sourcesVisible, setSourcesVisible] = useState(true);
  const [prompts, setPrompts] = useState(false);
  const [options, setOptions] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textarea.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [message]);
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
            context ? `Posez une question sur ${context.label}…` : "Demandez à votre assistant CRM…"
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
                {records.loading ? (
                  <p>Chargement des fiches…</p>
                ) : records.error ? (
                  <p>{records.error}</p>
                ) : !records.data.length ? (
                  <p>Aucune fiche trouvée.</p>
                ) : (
                  records.data.map((r) => (
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
          <Popover.Root open={adding} onOpenChange={setAdding}>
            <Popover.Trigger
              className={styles.addContext}
              type="button"
              disabled={busy}
              aria-label="Ajouter du contexte et des options"
              title="Ajouter du contexte"
            >
              <Plus size={18} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className={styles.composerMenu}
                align="start"
                side={placement === "top" ? "bottom" : "top"}
                sideOffset={8}
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                <strong>Ajouter du contexte</strong>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setOpen(true);
                  }}
                >
                  <Layers3 size={16} />
                  <span>Choisir une fiche CRM</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setPrompts(true);
                  }}
                >
                  <NotebookPen size={16} />
                  <span>Utiliser un raccourci</span>
                </button>
                <Link href="/app/integrations" prefetch={prefetchPrivate ? undefined : false}>
                  <SlidersHorizontal size={16} />
                  <span>Gérer mes intégrations</span>
                </Link>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Popover.Root open={approval} onOpenChange={setApproval}>
            <Popover.Trigger
              type="button"
              className={styles.approvalMode}
              aria-label="Mode de confirmation des actions"
            >
              <ShieldCheck size={13} />
              <span>Avec confirmation</span>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className={styles.composerMenu} align="start" sideOffset={8}>
                <strong>Vous gardez la main</strong>
                <div className={styles.approvalCurrent}>
                  <ShieldCheck size={16} />
                  <span>Rechercher et proposer</span>
                  <Check size={14} />
                </div>
                <p>
                  L’assistant recherche dans les sources autorisées. Les actions qui modifient votre
                  CRM doivent être confirmées avant exécution.
                </p>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
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
                <ChevronDown size={11} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className={styles.searchOptions}
                align="end"
                side={placement === "top" ? "bottom" : "top"}
                sideOffset={12}
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                <strong>Recherche dans votre CRM</strong>
                <p>L’assistant choisit les sources utiles à votre demande.</p>
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
                  Assistant IA de votre espace
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
      {placement === "top" && sourcesVisible && (
        <div className={styles.sourceStrip}>
          <span>Vos fiches, notes et échanges réunis</span>
          <div className={styles.sourceStripIcons} aria-label="Sources CRM disponibles">
            {[
              { label: "Entreprises", icon: Building2 },
              { label: "Personnes", icon: Users },
              { label: "Messages", icon: Mail },
              { label: "Réunions", icon: Video },
              { label: "Notes", icon: NotebookPen },
            ].map(({ label, icon: Icon }) => (
              <span key={label} title={label} role="img" aria-label={label}>
                <Icon size={15} />
              </span>
            ))}
          </div>
          <button
            type="button"
            aria-label="Masquer les sources de l’accueil"
            onClick={() => setSourcesVisible(false)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className={styles.composerNote}>
        <span>Zyliad peut se tromper. Vérifiez les sources.</span>
        <span>Entrée pour envoyer · ⇧ Entrée pour une ligne</span>
      </div>
    </div>
  );
}
