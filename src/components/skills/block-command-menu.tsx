"use client";
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { blockKinds, normalizeBlockSearch, type BlockKind } from "./blocks";
import { BlockIcon } from "./block-icons";
import { BlockSample } from "./block-fields";
import styles from "./block-editor.module.css";

type Props = {
  anchor: HTMLElement | null;
  query: string;
  active: number;
  onActive: (index: number) => void;
  onSelect: (kind: BlockKind) => void;
  onClose: () => void;
  listId: string;
};
export function matchingBlockCommands(query: string) {
  const search = normalizeBlockSearch(query);
  return blockKinds.filter((item) =>
    normalizeBlockSearch(`${item.label} ${item.description} ${item.aliases ?? ""}`).includes(
      search,
    ),
  );
}
export function BlockCommandMenu({
  anchor,
  query,
  active,
  onActive,
  onSelect,
  onClose,
  listId,
}: Props) {
  const [position, setPosition] = useState({ left: 0, top: 0, height: 356, ready: false });
  const [hovered, setHovered] = useState<BlockKind | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const uid = useId();
  const commands = matchingBlockCommands(query);
  const current = commands[active % Math.max(commands.length, 1)];
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect(),
        height = Math.min(356, window.innerHeight - 24),
        width = Math.min(375, window.innerWidth - 24),
        below = window.innerHeight - rect.bottom - 12,
        above = rect.top - 12;
      const top =
        below >= height
          ? rect.bottom + 5
          : above >= height
            ? rect.top - height - 5
            : Math.max(12, Math.min(rect.bottom + 5, window.innerHeight - height - 12));
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top,
        height,
        ready: true,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  useEffect(() => {
    root.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, query]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !anchor?.contains(event.target as Node))
        onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchor, onClose]);
  if (!position.ready) return null;
  const example = commands.find((command) => command.kind === hovered) ?? current;
  return createPortal(
    <div
      ref={root}
      className={styles.commandShell}
      data-skill-command-menu
      data-preview-side={position.left + 375 + 248 > window.innerWidth ? "left" : "right"}
      style={{
        left: position.left,
        top: position.top,
        width: "min(375px, calc(100vw - 24px))",
        height: position.height,
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className={styles.slashMenu} role="listbox" id={listId} aria-label="Types de blocs">
        {commands.length ? (
          commands.map((command, index) => (
            <Fragment key={command.kind}>
              {(index === 0 || commands[index - 1].group !== command.group) && (
                <div className={styles.menuLabel}>{query ? "Résultats" : command.group}</div>
              )}
              <button
                type="button"
                role="option"
                id={`${listId}-${command.kind}`}
                aria-selected={index === active % commands.length}
                title={command.description}
                onMouseEnter={() => {
                  onActive(index);
                  setHovered(command.kind);
                }}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(command.kind)}
              >
                <BlockIcon kind={command.kind} />
                <span>{command.label}</span>
                {command.shortcut && <kbd>{command.shortcut}</kbd>}
              </button>
            </Fragment>
          ))
        ) : (
          <p>Aucun bloc trouvé pour « {query} ».</p>
        )}
      </div>
      <footer>
        <button type="button" onClick={onClose}>
          Fermer le menu <kbd>esc</kbd>
        </button>
      </footer>
      {example && hovered && (
        <aside className={styles.commandPreview} aria-label={`Aperçu : ${example.label}`} id={uid}>
          <div data-example={example.kind}>
            <BlockSample kind={example.kind} />
          </div>
          <strong>{example.label}</strong>
          <p>{example.description}</p>
        </aside>
      )}
    </div>,
    document.body,
  );
}
