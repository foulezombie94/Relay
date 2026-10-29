"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  GripVertical,
  Lightbulb,
  Plus,
  Trash2,
  Undo2,
  Redo2,
  AtSign,
  Braces,
} from "lucide-react";
import {
  blockKinds,
  initialBlock,
  isLinkBlock,
  isToggleBlock,
  parseSkillBlocks,
  serializeSkillBlocks,
  type BlockKind,
  type SkillBlock,
} from "./blocks";
import { BlockCommandMenu, matchingBlockCommands } from "./block-command-menu";
import { BlockIcon } from "./block-icons";
import {
  InlineBlockText,
  LinkBlockFields,
  MediaReference,
  TableBlock,
  TableOfContents,
} from "./block-fields";
import styles from "./block-editor.module.css";
import { SkillReferenceMenu, type MentionRecord } from "./reference-menu";
import type { SkillManifest } from "@/lib/domain/agent-skills";

const limit = 12000,
  blockLimit = 200;
type EditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  workspace?: string;
  preview?: boolean;
  skillInputs?: SkillManifest["inputs"];
  onMention?: (record: MentionRecord) => boolean;
};
export function SkillBlockEditor({
  value,
  onChange,
  disabled = false,
  workspace,
  preview = false,
  skillInputs = [],
  onMention,
}: EditorProps) {
  const [blocks, setBlocks] = useState(() => parseSkillBlocks(value));
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [slash, setSlash] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashAnchor, setSlashAnchor] = useState<HTMLElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [reference, setReference] = useState<{
    id: string;
    kind: "mention" | "variable";
    query: string;
    start: number;
    end: number;
  } | null>(null);
  const [referenceAnchor, setReferenceAnchor] = useState<HTMLElement | null>(null);
  const lastFocused = useRef("");
  const root = useRef<HTMLDivElement>(null),
    inputs = useRef(new Map<string, HTMLTextAreaElement>()),
    serial = useRef(1000),
    emitted = useRef(value),
    past = useRef<SkillBlock[][]>([]),
    future = useRef<SkillBlock[][]>([]);
  const pending = useRef<{ id: string; offset?: number } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const listId = useId();
  const slashBlock = blocks.find((block) => block.id === slash);
  const slashQuery = slashBlock?.text.startsWith("/") ? slashBlock.text.slice(1) : "";
  const commands = matchingBlockCommands(slashQuery);
  function fresh(kind: BlockKind = "paragraph", text = "") {
    return initialBlock(kind, `new_${serial.current++}`, text);
  }
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setBlocks(parseSkillBlocks(value));
    past.current = [];
    future.current = [];
    setHistoryVersion((v) => v + 1);
    setSlash(null);
    setMenu(null);
    setReference(null);
  }, [value]);
  useLayoutEffect(() => {
    for (const input of inputs.current.values()) {
      input.style.height = "0px";
      input.style.height = `${Math.max(30, input.scrollHeight)}px`;
    }
    if (pending.current) {
      const { id, offset } = pending.current,
        input = inputs.current.get(id);
      if (input) {
        input.focus();
        const position = offset ?? input.value.length;
        input.setSelectionRange(position, position);
      }
      pending.current = null;
    }
    setSlashAnchor(slash ? (inputs.current.get(slash) ?? null) : null);
    setReferenceAnchor(reference ? (inputs.current.get(reference.id) ?? null) : null);
  }, [blocks, folded, slash, reference]);
  function openReference(kind: "mention" | "variable") {
    const id = lastFocused.current || blocks.find((block) => inputs.current.has(block.id))?.id;
    if (!id) return;
    const input = inputs.current.get(id);
    if (!input) return;
    input.focus();
    setSlash(null);
    setReference({ id, kind, query: "", start: input.selectionStart, end: input.selectionEnd });
  }
  function insertReference(text: string, record?: MentionRecord) {
    if (!reference) return;
    const block = blocks.find((item) => item.id === reference.id);
    if (!block) return;
    const next =
      block.text.slice(0, reference.start) + text + " " + block.text.slice(reference.end);
    if (
      serializeSkillBlocks(
        blocks.map((item) => (item.id === block.id ? { ...item, text: next } : item)),
      ).length > limit
    ) {
      setError("Les instructions dépassent la limite autorisée.");
      return;
    }
    if (record && onMention && !onMention(record)) {
      setError("La méthode peut référencer 12 ressources maximum.");
      return;
    }
    commit(
      blocks.map((item) => (item.id === block.id ? { ...item, text: next } : item)),
      { id: block.id, offset: reference.start + text.length + 1 },
    );
    setReference(null);
  }
  function commit(next: SkillBlock[], focus?: { id: string; offset?: number }, history = true) {
    if (disabled) return false;
    const serialized = serializeSkillBlocks(next);
    if (next.length > blockLimit || serialized.length > limit) {
      setError(
        `Limite atteinte : ${blockLimit} blocs et ${limit.toLocaleString("fr-FR")} caractères maximum.`,
      );
      return false;
    }
    if (history) {
      past.current = [...past.current.slice(-79), blocks];
      future.current = [];
    }
    setHistoryVersion((v) => v + 1);
    setError("");
    pending.current = focus ?? null;
    emitted.current = serialized;
    setBlocks(next);
    onChange(serialized);
    return true;
  }
  function patch(id: string, fields: Partial<SkillBlock>) {
    commit(blocks.map((block) => (block.id === id ? { ...block, ...fields } : block)));
  }
  function changeKind(id: string, kind: BlockKind, fromSlash = false) {
    const old = blocks.find((block) => block.id === id);
    if (!old) return;
    const retainedDetail = old.detail !== undefined && (isLinkBlock(kind) || isToggleBlock(kind));
    const retainedText = [
      old.text,
      ...(!retainedDetail && old.detail ? [old.detail] : []),
      ...(kind !== "table" && old.rows ? old.rows.map((row) => row.join(" | ")) : []),
    ]
      .filter(Boolean)
      .join("\n");
    const converted = {
      ...initialBlock(kind, id, fromSlash ? "" : retainedText),
      ...(retainedDetail ? { detail: old.detail } : {}),
      ...(kind === "table" && old.rows ? { rows: old.rows } : {}),
      ...(kind === "code" && old.language ? { language: old.language } : {}),
    };
    const next = blocks.map((block) => (block.id === id ? converted : block));
    if (kind === "divider") {
      const paragraph = fresh("paragraph", fromSlash ? "" : retainedText);
      next.splice(next.findIndex((block) => block.id === id) + 1, 0, paragraph);
      commit(next, { id: paragraph.id, offset: 0 });
    } else commit(next, { id });
    setSlash(null);
    setMenu(null);
  }
  function insert(index: number, before = false, openCommands = false) {
    const block = fresh();
    const target = index + (before ? 0 : 1);
    if (
      commit([...blocks.slice(0, target), block, ...blocks.slice(target)], {
        id: block.id,
        offset: 0,
      }) &&
      openCommands
    ) {
      setSlash(block.id);
      setSlashIndex(0);
    }
  }
  function remove(index: number) {
    const next = blocks.filter((_, i) => i !== index);
    if (!next.length) next.push(fresh());
    commit(next, { id: next[Math.max(0, index - 1)].id });
    setMenu(null);
    setSlash(null);
  }
  function move(index: number, target: number) {
    if (target < 0 || target >= blocks.length || index === target) return;
    const next = [...blocks],
      [block] = next.splice(index, 1);
    next.splice(target, 0, block);
    commit(next, { id: block.id });
    setMenu(null);
  }
  function undo(redo = false) {
    const stack = redo ? future : past,
      previous = stack.current.at(-1);
    if (!previous || disabled) return;
    stack.current = stack.current.slice(0, -1);
    const reverse = redo ? past : future;
    reverse.current = [...reverse.current, blocks];
    commit(previous, undefined, false);
    setSlash(null);
    setMenu(null);
  }
  function navigate(id: string) {
    const element =
      inputs.current.get(id) ?? root.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    element?.focus();
  }
  function format(block: SkillBlock, marker: string) {
    const input = inputs.current.get(block.id);
    if (!input) return;
    const start = input.selectionStart,
      end = input.selectionEnd;
    if (start === end) return;
    const selected = block.text.slice(start, end),
      wrapped = marker + selected + marker;
    commit(
      blocks.map((item) =>
        item.id === block.id
          ? { ...item, text: block.text.slice(0, start) + wrapped + block.text.slice(end) }
          : item,
      ),
      { id: block.id, offset: end + marker.length },
    );
  }
  let number = 0;
  return (
    <div
      ref={root}
      className={styles.editor}
      data-skill-block-editor
      aria-label="Éditeur de blocs des instructions"
      onBlur={(event) => {
        const target = event.relatedTarget as HTMLElement | null;
        if (
          target &&
          !event.currentTarget.contains(target) &&
          !target.closest("[data-skill-command-menu]")
        ) {
          setSlash(null);
          setReference(null);
        }
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          undo(event.shiftKey);
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
          event.preventDefault();
          undo(true);
        }
      }}
    >
      <div className={styles.toolbar}>
        <span>
          Écrivez, tapez <kbd>/</kbd> pour un bloc ou <kbd>@</kbd> pour une fiche
        </span>
        <button
          type="button"
          disabled={disabled}
          title="Mentionner une fiche CRM"
          aria-label="Mentionner une fiche CRM"
          onClick={() => openReference("mention")}
        >
          <AtSign size={15} />
        </button>
        <button
          type="button"
          disabled={disabled}
          title="Insérer un champ automatique"
          aria-label="Insérer un champ automatique"
          onClick={() => openReference("variable")}
        >
          <Braces size={15} />
        </button>
        <button
          type="button"
          disabled={disabled || !past.current.length}
          title="Annuler · Ctrl/⌘ Z"
          aria-label="Annuler la modification"
          onClick={() => undo()}
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          disabled={disabled || !future.current.length}
          title="Rétablir · Ctrl/⌘ Maj Z"
          aria-label="Rétablir la modification"
          onClick={() => undo(true)}
        >
          <Redo2 size={14} />
        </button>
      </div>
      <div className={styles.blocks} data-history={historyVersion}>
        {blocks.map((block, index) => {
          number = block.kind === "number" ? number + 1 : 0;
          const definition = blockKinds.find((item) => item.kind === block.kind)!;
          const toggle = isToggleBlock(block.kind);
          const closed = folded.has(block.id);
          const blockMenu = (
            <Dropdown.Root
              open={menu === block.id}
              onOpenChange={(open) => {
                setMenu(open ? block.id : null);
                setSlash(null);
              }}
            >
              <Dropdown.Trigger asChild>
                <button
                  type="button"
                  draggable
                  title="Déplacer le bloc · Cliquez pour les options"
                  aria-label={`Options du bloc ${index + 1}`}
                  onDragStart={(event) => {
                    setDragging(block.id);
                    event.dataTransfer.setData("text/plain", block.id);
                    event.dataTransfer.effectAllowed = "move";
                    setMenu(null);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                >
                  <GripVertical size={18} />
                </button>
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content
                  className={styles.menu}
                  side="left"
                  align="start"
                  collisionPadding={12}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                >
                  <Dropdown.Label className={styles.menuLabel}>
                    Bloc · {definition.label}
                  </Dropdown.Label>
                  <Dropdown.Sub>
                    <Dropdown.SubTrigger className={styles.menuItem}>
                      <BlockIcon kind={block.kind} size={16} />
                      Transformer en
                      <ChevronRight size={14} className={styles.pushRight} />
                    </Dropdown.SubTrigger>
                    <Dropdown.Portal>
                      <Dropdown.SubContent className={styles.menu} collisionPadding={12}>
                        {blockKinds.map((item) => (
                          <Dropdown.Item
                            className={styles.menuItem}
                            key={item.kind}
                            onSelect={() => changeKind(block.id, item.kind)}
                          >
                            <BlockIcon kind={item.kind} size={17} />
                            {item.label}
                            {block.kind === item.kind && (
                              <Check size={13} className={styles.pushRight} />
                            )}
                          </Dropdown.Item>
                        ))}
                      </Dropdown.SubContent>
                    </Dropdown.Portal>
                  </Dropdown.Sub>
                  <Dropdown.Item
                    className={styles.menuItem}
                    onSelect={() => {
                      const duplicate = { ...block, id: fresh().id };
                      commit(
                        [...blocks.slice(0, index + 1), duplicate, ...blocks.slice(index + 1)],
                        { id: duplicate.id },
                      );
                      setMenu(null);
                    }}
                  >
                    <Copy size={16} />
                    Dupliquer<kbd>Ctrl D</kbd>
                  </Dropdown.Item>
                  <Dropdown.Separator className={styles.separator} />
                  <Dropdown.Item
                    className={styles.menuItem}
                    disabled={index === 0}
                    onSelect={() => move(index, index - 1)}
                  >
                    <ArrowUp size={16} />
                    Monter
                  </Dropdown.Item>
                  <Dropdown.Item
                    className={styles.menuItem}
                    disabled={index === blocks.length - 1}
                    onSelect={() => move(index, index + 1)}
                  >
                    <ArrowDown size={16} />
                    Descendre
                  </Dropdown.Item>
                  <Dropdown.Separator className={styles.separator} />
                  <Dropdown.Item className={styles.menuItem} onSelect={() => remove(index)}>
                    <Trash2 size={16} />
                    Supprimer
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          );
          return (
            <div
              key={block.id}
              className={styles.block}
              tabIndex={-1}
              data-block-id={block.id}
              data-kind={block.kind}
              data-dragging={dragging === block.id}
              data-drop={dropTarget === block.id}
              onContextMenu={(event) => {
                if (!disabled) {
                  event.preventDefault();
                  setMenu(block.id);
                  setSlash(null);
                }
              }}
              onDragOver={(event) => {
                if (dragging && !disabled) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget(block.id);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging)
                  move(
                    blocks.findIndex((item) => item.id === dragging),
                    index,
                  );
                setDragging(null);
                setDropTarget(null);
              }}
            >
              {!disabled && (
                <div className={styles.handles}>
                  <button
                    type="button"
                    title="Ajouter un bloc en dessous · Alt pour l’ajouter au-dessus"
                    aria-label={`Ajouter un bloc après le bloc ${index + 1}`}
                    onClick={(event) => insert(index, event.altKey, true)}
                  >
                    <Plus size={18} />
                  </button>
                  {blockMenu}
                </div>
              )}
              {block.kind === "divider" ? (
                <hr className={styles.divider} />
              ) : block.kind === "table" ? (
                <TableBlock
                  block={block}
                  disabled={disabled}
                  onChange={(fields) => patch(block.id, fields)}
                />
              ) : block.kind === "toc" ? (
                <TableOfContents blocks={blocks} onNavigate={navigate} />
              ) : (
                <>
                  {block.kind === "bullet" && <span className={styles.marker}>•</span>}
                  {block.kind === "number" && <span className={styles.marker}>{number}.</span>}
                  {block.kind === "todo" && (
                    <input
                      className={styles.checkbox}
                      type="checkbox"
                      aria-label={`Cocher le bloc ${index + 1}`}
                      disabled={disabled}
                      checked={!!block.checked}
                      onChange={(event) => patch(block.id, { checked: event.target.checked })}
                    />
                  )}
                  {block.kind === "callout" && (
                    <Lightbulb className={styles.calloutIcon} size={20} />
                  )}
                  {toggle && (
                    <button
                      className={styles.toggleButton}
                      type="button"
                      aria-expanded={!closed}
                      aria-label={closed ? "Déplier le contenu" : "Replier le contenu"}
                      onClick={() =>
                        setFolded((previous) => {
                          const next = new Set(previous);
                          if (next.has(block.id)) next.delete(block.id);
                          else next.add(block.id);
                          return next;
                        })
                      }
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                  <div className={styles.blockContent}>
                    {block.kind === "code" && (
                      <div className={styles.codeBar}>
                        <select
                          aria-label="Langage du code"
                          value={block.language ?? "text"}
                          disabled={disabled}
                          onChange={(event) => patch(block.id, { language: event.target.value })}
                        >
                          {Array.from(
                            new Set([
                              "text",
                              "javascript",
                              "typescript",
                              "python",
                              "sql",
                              "json",
                              "markdown",
                              "html",
                              "css",
                              "bash",
                              "mermaid",
                              block.language ?? "text",
                            ]),
                          ).map((language) => (
                            <option key={language}>{language}</option>
                          ))}
                        </select>
                        <span>Code</span>
                      </div>
                    )}
                    <textarea
                      ref={(element) => {
                        if (element) inputs.current.set(block.id, element);
                        else inputs.current.delete(block.id);
                      }}
                      className={styles.text}
                      onFocus={() => {
                        lastFocused.current = block.id;
                      }}
                      aria-label={`${definition.label} · bloc ${index + 1}`}
                      aria-controls={slash === block.id ? listId : undefined}
                      aria-expanded={slash === block.id ? true : undefined}
                      aria-activedescendant={
                        slash === block.id && commands.length
                          ? `${listId}-${commands[slashIndex % commands.length].kind}`
                          : undefined
                      }
                      disabled={disabled}
                      rows={1}
                      value={block.text}
                      maxLength={limit}
                      placeholder={
                        toggle
                          ? "Titre du contenu dépliant"
                          : block.kind.startsWith("heading")
                            ? "Titre"
                            : isLinkBlock(block.kind)
                              ? `Nom du ${definition.label.toLowerCase()}`
                              : index === 0
                                ? "Décrivez ce que l’agent doit faire…"
                                : "Écrivez quelque chose, ou tapez /…"
                      }
                      onChange={(event) => {
                        const text = event.target.value;
                        const shortcuts: Record<string, BlockKind> = {
                          "# ": "heading1",
                          "## ": "heading2",
                          "### ": "heading3",
                          "#### ": "heading4",
                          "- ": "bullet",
                          "* ": "bullet",
                          "1. ": "number",
                          "[] ": "todo",
                          "[ ] ": "todo",
                          "> ": "toggle",
                          '" ': "quote",
                          "--- ": "divider",
                        };
                        if (block.kind === "paragraph" && shortcuts[text]) {
                          changeKind(block.id, shortcuts[text], true);
                          return;
                        }
                        patch(block.id, { text });
                        setSlash(text.startsWith("/") && !text.includes("\n") ? block.id : null);
                        setSlashIndex(0);
                        const end = event.target.selectionStart,
                          prefix = text.slice(0, end),
                          mention = /(?:^|[\s(])@([^@\[\]\n]{0,80})$/.exec(prefix),
                          variable = /\{\{([a-z0-9_.]{0,80})$/.exec(prefix);
                        setReference(
                          mention
                            ? {
                                id: block.id,
                                kind: "mention",
                                query: mention[1],
                                start: end - mention[1].length - 1,
                                end,
                              }
                            : variable
                              ? {
                                  id: block.id,
                                  kind: "variable",
                                  query: variable[1],
                                  start: end - variable[1].length - 2,
                                  end,
                                }
                              : null,
                        );
                      }}
                      onPaste={(event) => {
                        const text = event.clipboardData.getData("text/plain");
                        if (!text.includes("\n") || block.kind === "code") return;
                        event.preventDefault();
                        const input = event.currentTarget,
                          before = block.text.slice(0, input.selectionStart),
                          after = block.text.slice(input.selectionEnd);
                        const pasted = parseSkillBlocks(before + text + after).map((item) => ({
                          ...item,
                          id: fresh().id,
                        }));
                        commit([...blocks.slice(0, index), ...pasted, ...blocks.slice(index + 1)], {
                          id: pasted.at(-1)!.id,
                        });
                        setSlash(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return;
                        if (
                          (event.ctrlKey || event.metaKey) &&
                          ["b", "i", "e"].includes(event.key.toLowerCase())
                        ) {
                          event.preventDefault();
                          format(
                            block,
                            event.key.toLowerCase() === "b"
                              ? "**"
                              : event.key.toLowerCase() === "i"
                                ? "*"
                                : "`",
                          );
                          return;
                        }
                        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
                          event.preventDefault();
                          const duplicate = { ...block, id: fresh().id };
                          commit(
                            [...blocks.slice(0, index + 1), duplicate, ...blocks.slice(index + 1)],
                            { id: duplicate.id },
                          );
                          return;
                        }
                        if (slash === block.id) {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setSlash(null);
                            return;
                          }
                          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                            event.preventDefault();
                            setSlashIndex(
                              (current) =>
                                (current +
                                  (event.key === "ArrowDown" ? 1 : -1) +
                                  Math.max(1, commands.length)) %
                                Math.max(1, commands.length),
                            );
                            return;
                          }
                          if (event.key === "Enter") {
                            event.preventDefault();
                            if (commands.length)
                              changeKind(
                                block.id,
                                commands[slashIndex % commands.length].kind,
                                true,
                              );
                            return;
                          }
                        }
                        const input = event.currentTarget;
                        if (event.key === "Enter" && !event.shiftKey && block.kind !== "code") {
                          event.preventDefault();
                          if (!block.text && block.kind !== "paragraph") {
                            changeKind(block.id, "paragraph");
                            return;
                          }
                          const left = block.text.slice(0, input.selectionStart),
                            right = block.text.slice(input.selectionEnd),
                            next = fresh(
                              ["bullet", "number", "todo"].includes(block.kind)
                                ? block.kind
                                : "paragraph",
                              right,
                            );
                          commit(
                            [
                              ...blocks.slice(0, index),
                              { ...block, text: left },
                              next,
                              ...blocks.slice(index + 1),
                            ],
                            { id: next.id, offset: 0 },
                          );
                          setSlash(null);
                        }
                        if (
                          event.key === "Backspace" &&
                          input.selectionStart === 0 &&
                          input.selectionEnd === 0
                        ) {
                          if (block.kind !== "paragraph") {
                            event.preventDefault();
                            changeKind(block.id, "paragraph");
                          } else if (index > 0) {
                            const previous = blocks[index - 1];
                            if (
                              [
                                "paragraph",
                                "heading1",
                                "heading2",
                                "heading3",
                                "heading4",
                                "bullet",
                                "number",
                                "todo",
                                "quote",
                              ].includes(previous.kind)
                            ) {
                              event.preventDefault();
                              commit(
                                [
                                  ...blocks.slice(0, index - 1),
                                  { ...previous, text: previous.text + block.text },
                                  ...blocks.slice(index + 1),
                                ],
                                { id: previous.id, offset: previous.text.length },
                              );
                            } else if (previous.kind === "divider") {
                              event.preventDefault();
                              commit(
                                blocks.filter((_, i) => i !== index - 1),
                                { id: block.id, offset: 0 },
                              );
                            }
                          }
                        }
                      }}
                    />
                    {toggle && !closed && (
                      <textarea
                        className={styles.toggleDetail}
                        aria-label={`Détails du bloc ${index + 1}`}
                        value={block.detail ?? ""}
                        disabled={disabled}
                        placeholder="Ajoutez les détails à replier…"
                        rows={2}
                        maxLength={limit}
                        onChange={(event) => patch(block.id, { detail: event.target.value })}
                      />
                    )}
                    {isLinkBlock(block.kind) && (
                      <LinkBlockFields
                        block={block}
                        disabled={disabled}
                        onChange={(fields) => patch(block.id, fields)}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {slash && !disabled && (
        <BlockCommandMenu
          anchor={slashAnchor}
          query={slashQuery}
          active={slashIndex}
          onActive={setSlashIndex}
          onSelect={(kind) => changeKind(slash, kind, true)}
          onClose={() => setSlash(null)}
          listId={listId}
        />
      )}
      {reference && !disabled && (
        <SkillReferenceMenu
          anchor={referenceAnchor}
          workspace={workspace}
          preview={preview}
          kind={reference.kind}
          query={reference.query}
          inputs={skillInputs}
          onSelect={insertReference}
          onClose={() => setReference(null)}
        />
      )}
      {!disabled && (
        <button
          className={styles.addBlock}
          type="button"
          onClick={() => insert(blocks.length - 1, false, true)}
        >
          <Plus size={16} />
          Ajouter un bloc
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SkillBlocksPreview({ value }: { value: string }) {
  const root = useRef<HTMLDivElement>(null),
    scope = useId();
  const blocks = parseSkillBlocks(value);
  let number = 0;
  return (
    <div ref={root} className={styles.preview}>
      {blocks.map((block) => {
        number = block.kind === "number" ? number + 1 : 0;
        const text = <InlineBlockText text={block.text} />;
        const content =
          block.kind === "divider" ? (
            <hr />
          ) : block.kind === "heading1" ? (
            <h2>{text}</h2>
          ) : block.kind === "heading2" ? (
            <h3>{text}</h3>
          ) : block.kind === "heading3" ? (
            <h4>{text}</h4>
          ) : block.kind === "heading4" ? (
            <h5>{text}</h5>
          ) : block.kind === "quote" ? (
            <blockquote>{text}</blockquote>
          ) : block.kind === "bullet" ? (
            <ul>
              <li>{text}</li>
            </ul>
          ) : block.kind === "number" ? (
            <ol start={number}>
              <li>{text}</li>
            </ol>
          ) : block.kind === "todo" ? (
            <div className={styles.previewTodo}>
              <span aria-label={block.checked ? "Coché" : "Non coché"}>
                {block.checked ? "☑" : "☐"}
              </span>
              <span>{text}</span>
            </div>
          ) : block.kind === "callout" ? (
            <div className={styles.previewCallout}>
              <Lightbulb size={18} />
              <span>{text}</span>
            </div>
          ) : isToggleBlock(block.kind) ? (
            <details className={styles.previewToggle} data-kind={block.kind}>
              <summary>{text || "Sans titre"}</summary>
              <p>
                <InlineBlockText text={block.detail ?? ""} />
              </p>
            </details>
          ) : block.kind === "code" ? (
            <pre>
              <code>{block.text}</code>
            </pre>
          ) : block.kind === "table" ? (
            <TableBlock block={block} disabled onChange={() => {}} />
          ) : isLinkBlock(block.kind) ? (
            <MediaReference key={block.detail} block={block} />
          ) : block.kind === "toc" ? (
            <TableOfContents
              blocks={blocks}
              onNavigate={(id) =>
                root.current
                  ?.querySelector<HTMLElement>(`[data-preview-block="${id}"]`)
                  ?.scrollIntoView({ block: "center", behavior: "smooth" })
              }
            />
          ) : (
            <p>{text}</p>
          );
        return (
          <div key={block.id} id={`${scope}-${block.id}`} data-preview-block={block.id}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
