"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronLeft, Plus, Search, Sparkles, WandSparkles, X } from "lucide-react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { request, useWorkspace } from "../providers/data-provider";
import type { SkillDetail, SkillSummary } from "@/lib/domain/agent-skills";
import type { AssistantApprovalMode } from "@/lib/domain/assistant-approval";
import { SkillPreparation } from "./preparation";
import styles from "../assistant/assistant.module.css";
export type ChatSkillSelection =
  | { id: string; version_id: string; inputs: Record<string, unknown> }
  | { builder: true; inputs: Record<string, unknown> };
type Props = {
  busy: boolean;
  selectedLabel?: string;
  initialId?: string | null;
  context?: { id: string; label: string } | null;
  mode?: AssistantApprovalMode;
  slashQuery?: string | null;
  onSlashHandled?: () => void;
  onContext?: (record: { id: string; label: string } | null) => void;
  onSelect: (selection: ChatSkillSelection, label: string) => void;
  onClear: () => void;
};
export function ChatSkillPicker({
  busy,
  selectedLabel,
  initialId,
  context = null,
  mode = "review",
  slashQuery = null,
  onSlashHandled,
  onContext,
  onSelect,
  onClear,
}: Props) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false),
    [skillId, setSkillId] = useState(""),
    [search, setSearch] = useState(""),
    [term, setTerm] = useState(""),
    [active, setActive] = useState(0);
  const opened = useRef("");
  const slashOpening = useRef(false);
  useEffect(() => {
    if (!initialId || !/^[0-9a-f-]{36}$/i.test(initialId) || opened.current === initialId) return;
    opened.current = initialId;
    setSkillId(initialId);
    setOpen(true);
  }, [initialId]);
  useEffect(() => {
    if (slashQuery !== null && !busy) {
      slashOpening.current = true;
      setOpen(true);
      if (!skillId) setSearch(slashQuery);
    } else if (slashQuery === null && slashOpening.current && !skillId) {
      slashOpening.current = false;
      setOpen(false);
    }
  }, [slashQuery, busy, skillId]);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const listing = useInfiniteQuery({
    queryKey: ["skills-picker", workspace.id, term],
    enabled: open,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      request<{ data: SkillSummary[]; next: string | null }>(
        `/api/${workspace.id}/skills?q=${encodeURIComponent(term)}${pageParam ? `&after=${pageParam}` : ""}`,
      ),
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const details = useQuery({
    queryKey: ["skill-picker-detail", workspace.id, skillId],
    enabled: !!skillId,
    queryFn: () => request<{ data: SkillDetail }>(`/api/${workspace.id}/skills?id=${skillId}`),
  });
  const skill = details.data?.data.skill,
    manifest = details.data?.data.versions.find(
      (version) => version.id === skill?.granted_version_id,
    )?.manifest;
  const available = useMemo(
    () =>
      listing.data?.pages
        .flatMap((page) => page.data)
        .filter((item) => item.status === "published" && item.enabled && item.granted_version_id) ??
      [],
    [listing.data],
  );
  function choose(item: SkillSummary) {
    setSkillId(item.id);
    onSlashHandled?.();
  }
  useEffect(() => {
    setActive(0);
  }, [term]);
  useEffect(() => {
    if (!open || slashQuery === null || skillId) return;
    const handler = (event: KeyboardEvent) => {
      if (
        !(event.target instanceof HTMLTextAreaElement) ||
        event.target.getAttribute("aria-label") !== "Message à l’assistant" ||
        event.isComposing
      )
        return;
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setOpen(false);
        onSlashHandled?.();
      } else if (event.key === "Enter") {
        const item = available[active % Math.max(1, available.length)];
        if (item) choose(item);
      } else
        setActive(
          (value) =>
            (value + (event.key === "ArrowDown" ? 1 : -1) + Math.max(1, available.length)) %
            Math.max(1, available.length),
        );
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, slashQuery, skillId, available, active, onSlashHandled]);
  return (
    <div className={styles.chatSkillWrap}>
      {selectedLabel && (
        <span className={styles.chatSkillChip}>
          <Sparkles size={12} />
          {selectedLabel}
          <button type="button" disabled={busy} aria-label="Retirer la méthode" onClick={onClear}>
            <X size={12} />
          </button>
        </span>
      )}
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setSkillId("");
            setSearch("");
            onSlashHandled?.();
          }
        }}
      >
        <Popover.Trigger
          className={styles.chatSkillTrigger}
          type="button"
          disabled={busy}
          title="Choisir une méthode · / dans le message"
          aria-label="Choisir une méthode pour l’assistant"
        >
          <Sparkles size={15} />
          <span>Méthode</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className={styles.skillPopover}
            data-preparing={!!skillId}
            align="start"
            sideOffset={8}
            collisionPadding={12}
            onOpenAutoFocus={(event) => {
              if (slashQuery !== null) event.preventDefault();
            }}
          >
            {skillId && (
              <button type="button" className={styles.skillBack} onClick={() => setSkillId("")}>
                <ChevronLeft size={14} />
                Toutes les méthodes
              </button>
            )}
            {!skillId ? (
              <>
                <strong>Choisir une méthode</strong>
                <p>
                  Préparez le contexte avant de l’utiliser. Les autorisations du chat restent
                  prioritaires.
                </p>
                <label className={styles.skillField}>
                  <span className={styles.skillSearchLabel}>
                    <Search size={13} /> Rechercher
                  </span>
                  <input
                    aria-label="Rechercher une méthode"
                    value={search}
                    maxLength={200}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nom ou description…"
                  />
                </label>
                {listing.isPending ? (
                  <p>Chargement…</p>
                ) : listing.isError ? (
                  <p role="alert">Chargement impossible. Réessayez en rouvrant le menu.</p>
                ) : available.length ? (
                  available.map((item, index) => (
                    <button
                      type="button"
                      className={styles.skillOption}
                      data-selected={index === active % available.length}
                      key={item.id}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(item)}
                    >
                      <Sparkles size={14} />
                      <span>
                        <b>{item.name}</b>
                        <small>{item.description}</small>
                      </span>
                    </button>
                  ))
                ) : (
                  <p>Aucune méthode publiée et autorisée n’est activée pour cette recherche.</p>
                )}
                {listing.hasNextPage && (
                  <button
                    type="button"
                    className={styles.skillBack}
                    disabled={listing.isFetchingNextPage}
                    onClick={() => void listing.fetchNextPage()}
                  >
                    Charger les méthodes suivantes
                  </button>
                )}
                <button
                  type="button"
                  className={styles.skillOption}
                  onClick={() => {
                    onSelect({ builder: true, inputs: {} }, "Créer une méthode");
                    setOpen(false);
                    onSlashHandled?.();
                  }}
                >
                  <WandSparkles size={14} />
                  <span>
                    <b>Créer une méthode</b>
                    <small>Concevoir un brouillon sans action CRM.</small>
                  </span>
                </button>
                <Link
                  className={styles.skillLibraryLink}
                  href={`/app/skills?workspace=${workspace.id}`}
                >
                  <Plus size={14} />
                  Ouvrir la bibliothèque de skills
                </Link>
              </>
            ) : details.isPending ? (
              <p>Chargement de la méthode…</p>
            ) : details.isError ? (
              <p role="alert">Cette méthode n’est plus accessible.</p>
            ) : !manifest || !skill?.enabled || !skill.granted_version_id ? (
              <p>Activez une version autorisée dans la bibliothèque avant de l’utiliser.</p>
            ) : (
              <>
                <strong>{manifest.name}</strong>
                <p>{manifest.description}</p>
                <SkillPreparation
                  key={skill.id + skill.granted_version_id}
                  workspace={workspace.id}
                  id={skill.id}
                  versionId={skill.granted_version_id}
                  manifest={manifest}
                  record={context}
                  mode={mode}
                  onReady={(inputs, record) => {
                    onSelect(
                      { id: skill.id, version_id: skill.granted_version_id!, inputs },
                      manifest.name,
                    );
                    onContext?.(record);
                    setOpen(false);
                    setSkillId("");
                    onSlashHandled?.();
                  }}
                />
              </>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
