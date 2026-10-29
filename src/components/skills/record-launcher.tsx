"use client";
import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { request, useWorkspace } from "../providers/data-provider";
import type { SkillSummary } from "@/lib/domain/agent-skills";
import styles from "./skills.module.css";
export function RecordSkillLauncher({ recordId }: { recordId: string }) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const methods = useQuery({
    queryKey: ["record-skills", workspace.id, term],
    enabled: open,
    queryFn: () =>
      request<{ data: SkillSummary[] }>(
        `/api/${workspace.id}/skills?q=${encodeURIComponent(term)}`,
      ),
  });
  const available =
    methods.data?.data.filter(
      (skill) => skill.status === "published" && skill.enabled && skill.granted_version_id,
    ) ?? [];
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="button small" type="button">
        <Sparkles size={14} />
        Utiliser une méthode
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.resourcePopover}
          sideOffset={6}
          align="start"
          collisionPadding={12}
        >
          <label>
            <Search size={15} />
            <input
              aria-label="Rechercher une méthode pour cette fiche"
              maxLength={200}
              placeholder="Rechercher une méthode…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <p>La fiche sera transmise au chat. Aucune action ne démarre au clic.</p>
          {methods.isPending ? (
            <p>Chargement…</p>
          ) : methods.isError ? (
            <p role="alert">Chargement impossible.</p>
          ) : available.length ? (
            available.map((skill) => (
              <Link
                className={styles.resourceResult}
                key={skill.id}
                href={`/app/assistant?workspace=${workspace.id}&record=${recordId}&skill=${skill.id}`}
              >
                <Sparkles size={15} />
                <span>
                  {skill.name}
                  <small>{skill.description}</small>
                </span>
              </Link>
            ))
          ) : (
            <p>Aucune méthode activée pour cette recherche.</p>
          )}
          <Link className={styles.skillLibraryLink} href={`/app/skills?workspace=${workspace.id}`}>
            Ouvrir la bibliothèque
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
