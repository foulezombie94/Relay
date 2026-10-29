"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Braces } from "lucide-react";
import { request } from "../providers/data-provider";
import { skillMention, skillVariables } from "@/lib/domain/skill-context";
import type { SkillManifest } from "@/lib/domain/agent-skills";
import styles from "./block-editor.module.css";
export type MentionRecord = { id: string; display_name: string };
type Props = {
  anchor: HTMLElement | null;
  workspace?: string;
  preview: boolean;
  kind: "mention" | "variable";
  query: string;
  inputs: SkillManifest["inputs"];
  onSelect: (text: string, record?: MentionRecord) => void;
  onClose: () => void;
};
const examples: MentionRecord[] = [
  { id: "00000000-0000-4000-8000-000000000101", display_name: "Exemple · Studio Rivage" },
  { id: "00000000-0000-4000-8000-000000000102", display_name: "Exemple · Camille Martin" },
];
export function SkillReferenceMenu({
  anchor,
  workspace,
  preview,
  kind,
  query,
  inputs,
  onSelect,
  onClose,
}: Props) {
  const [term, setTerm] = useState(query),
    [index, setIndex] = useState(0),
    [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setIndex(0);
    const timer = setTimeout(() => setTerm(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const records = useQuery({
    queryKey: ["skill-mentions", workspace, term],
    enabled: !!workspace && !preview && kind === "mention",
    queryFn: () =>
      request<{ data: MentionRecord[] }>(
        `/api/${workspace}/records?size=20&q=${encodeURIComponent(term)}`,
      ),
  });
  const options =
    kind === "mention"
      ? (preview
          ? examples.filter((record) =>
              record.display_name.toLowerCase().includes(query.toLowerCase()),
            )
          : (records.data?.data ?? [])
        ).map((record) => ({
          key: record.id,
          label: record.display_name,
          detail: preview ? "Fiche fictive" : "Fiche CRM",
          text: skillMention(record),
          record,
        }))
      : [
          ...skillVariables.map(([key, label]) => ({
            key,
            label,
            detail: `{{${key}}}`,
            text: `{{${key}}}`,
            record: undefined,
          })),
          ...inputs.map((input) => ({
            key: `input.${input.key}`,
            label: input.label,
            detail: `{{input.${input.key}}}`,
            text: `{{input.${input.key}}}`,
            record: undefined,
          })),
        ].filter((option) =>
          `${option.label} ${option.key}`.toLowerCase().includes(query.toLowerCase()),
        );
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 362)),
        top: Math.max(
          12,
          rect.bottom + 300 < window.innerHeight ? rect.bottom + 4 : rect.top - 304,
        ),
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
    if (!anchor) return;
    const handler = (event: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key) || event.isComposing)
        return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") onClose();
      else if (event.key === "Enter") {
        const choice = options[index % Math.max(1, options.length)];
        if (choice) onSelect(choice.text, choice.record);
      } else
        setIndex(
          (value) =>
            (value + (event.key === "ArrowDown" ? 1 : -1) + Math.max(1, options.length)) %
            Math.max(1, options.length),
        );
    };
    anchor.addEventListener("keydown", handler, true);
    return () => anchor.removeEventListener("keydown", handler, true);
  }, [anchor, index, options, onClose, onSelect]);
  useEffect(() => {
    const handler = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !anchor?.contains(event.target as Node))
        onClose();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [anchor, onClose]);
  useEffect(() => {
    root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index]);
  if (!position) return null;
  return createPortal(
    <div
      ref={root}
      data-skill-command-menu
      className={styles.referenceMenu}
      style={position}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className={styles.menuLabel}>
        {kind === "mention" ? "Mentionner une fiche CRM" : "Insérer un champ automatique"}
      </div>
      <div
        role="listbox"
        aria-label={kind === "mention" ? "Fiches à mentionner" : "Champs automatiques"}
      >
        {options.map((option, i) => (
          <button
            key={option.key}
            type="button"
            role="option"
            aria-selected={i === index % Math.max(1, options.length)}
            onMouseEnter={() => setIndex(i)}
            onClick={() => onSelect(option.text, option.record)}
          >
            {kind === "mention" ? <AtSign size={17} /> : <Braces size={17} />}
            <span>
              {option.label}
              <small>{option.detail}</small>
            </span>
          </button>
        ))}
        {!options.length && (
          <p>
            {records.isFetching
              ? "Recherche…"
              : records.isError
                ? "Recherche indisponible."
                : "Aucun résultat."}
          </p>
        )}
      </div>
      <footer>↑ ↓ pour naviguer · Entrée pour insérer · Échap pour fermer</footer>
    </div>,
    document.body,
  );
}
