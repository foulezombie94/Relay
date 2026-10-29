"use client";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search, X, Upload, ExternalLink } from "lucide-react";
import { request } from "../providers/data-provider";
import type { SkillManifest } from "@/lib/domain/agent-skills";
import styles from "./skills.module.css";
type SearchData = {
  groups: { resource: string; results: { id: string; title: string; excerpt: string }[] }[];
};
type Props = {
  workspace: string;
  skillId: string;
  resources: SkillManifest["resources"];
  disabled: boolean;
  preview: boolean;
  onChange: (resources: SkillManifest["resources"]) => void;
};
export function SkillResourceProperty({
  workspace,
  skillId,
  resources,
  disabled,
  preview,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [term, setTerm] = useState("");
  const [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState("");
  const latest = useRef({ resources, onChange });
  latest.current = { resources, onChange };
  const documents = useQuery({
    queryKey: ["skill-reference-documents", workspace, term],
    enabled: open && !preview,
    queryFn: () =>
      request<{ data: { id: string; name: string; extraction_status: string }[] }>(
        `/api/${workspace}/files?q=${encodeURIComponent(term)}`,
      ),
  });
  async function upload(file?: File) {
    if (!file || preview || uploading) return;
    setUploadError("");
    if (file.size > 4 * 1024 * 1024 || file.size === 0) {
      setUploadError("Choisissez un fichier non vide de 4 Mo maximum.");
      return;
    }
    if (latest.current.resources.length >= 12) {
      setUploadError("Retirez une ressource avant d’ajouter un fichier.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("skill_id", skillId);
      const result = await request<{
        data: { id: string; name: string; extraction_status: string };
      }>(`/api/${workspace}/files`, "POST", body, { timeoutMs: 30000 });
      if (latest.current.resources.length < 12)
        latest.current.onChange([
          ...latest.current.resources,
          { type: "document", id: result.data.id, label: result.data.name.slice(0, 100) },
        ]);
      else
        setUploadError(
          "Le document est déposé dans l’espace. Retirez une ressource puis sélectionnez-le dans la liste.",
        );
      await documents.refetch();
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : "Dépôt impossible.");
    } finally {
      setUploading(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const result = useQuery({
    queryKey: ["skill-resources", workspace, term],
    enabled: open && !preview && term.length >= 2,
    queryFn: () =>
      request<SearchData>(`/api/${workspace}/search?q=${encodeURIComponent(term)}&scope=all`),
  });
  const options =
    result.data?.groups
      .filter((group) => ["records", "notes"].includes(group.resource))
      .flatMap((group) =>
        group.results.map((item) => ({
          ...item,
          type: group.resource === "records" ? ("record" as const) : ("note" as const),
        })),
      ) ?? [];
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className={styles.resourceTrigger} disabled={disabled} type="button">
          {resources.length ? (
            resources.map((resource) => (
              <span key={`${resource.type}-${resource.id}`}>
                <FileText size={13} />
                {resource.label || "Ressource"}
              </span>
            ))
          ) : (
            <span className={styles.emptyProperty}>Vide</span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.resourcePopover}
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={12}
        >
          <label>
            <Search size={15} />
            <input
              aria-label="Rechercher une ressource"
              placeholder="Rechercher une fiche ou une note…"
              value={search}
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {resources.map((resource) => (
            <div className={styles.resourceSelected} key={`${resource.type}-${resource.id}`}>
              <FileText size={14} />
              <span>{resource.label || "Ressource"}</span>
              {resource.type === "document" && !preview && (
                <a
                  href={`/api/${workspace}/files?id=${resource.id}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Ouvrir ${resource.label}`}
                >
                  <ExternalLink size={13} />
                </a>
              )}
              <button
                disabled={uploading}
                type="button"
                aria-label={`Retirer ${resource.label || "la ressource"}`}
                onClick={() =>
                  onChange(
                    resources.filter(
                      (item) => !(item.id === resource.id && item.type === resource.type),
                    ),
                  )
                }
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {preview ? (
            <p>La recherche de ressources est disponible dans votre espace connecté.</p>
          ) : term.length < 2 ? (
            <p>Recherchez dans les fiches et notes auxquelles vous avez accès.</p>
          ) : result.isFetching ? (
            <p>Recherche…</p>
          ) : result.isError ? (
            <p role="alert">Recherche indisponible. Réessayez.</p>
          ) : options.length ? (
            options
              .filter(
                (item) =>
                  !resources.some(
                    (resource) => resource.id === item.id && resource.type === item.type,
                  ),
              )
              .map((item) => (
                <button
                  type="button"
                  className={styles.resourceResult}
                  key={`${item.type}-${item.id}`}
                  disabled={uploading || resources.length >= 12}
                  onClick={() => {
                    onChange([
                      ...resources,
                      { type: item.type, id: item.id, label: item.title.slice(0, 100) },
                    ]);
                    setSearch("");
                  }}
                >
                  <FileText size={16} />
                  <span>
                    {item.title}
                    <small>{item.type === "record" ? "Fiche CRM" : "Note"}</small>
                  </span>
                </button>
              ))
          ) : (
            <p>Aucune ressource trouvée.</p>
          )}
          <div className={styles.documentResources}>
            <strong>Documents de l’espace</strong>
            {!preview &&
              documents.data?.data
                .filter(
                  (document) =>
                    !resources.some(
                      (resource) => resource.type === "document" && resource.id === document.id,
                    ),
                )
                .map((document) => (
                  <button
                    type="button"
                    className={styles.resourceResult}
                    key={document.id}
                    disabled={uploading || resources.length >= 12}
                    onClick={() =>
                      onChange([
                        ...resources,
                        { type: "document", id: document.id, label: document.name.slice(0, 100) },
                      ])
                    }
                  >
                    <FileText size={16} />
                    <span>
                      {document.name}
                      <small>
                        {document.extraction_status === "complete"
                          ? "Texte disponible"
                          : document.extraction_status === "partial"
                            ? "Texte partiellement disponible"
                            : "Lecture du texte indisponible"}
                      </small>
                    </span>
                  </button>
                ))}
            {documents.isError && <p>Chargement des documents impossible.</p>}
            <label className={styles.uploadResource}>
              <Upload size={14} />
              {uploading ? "Dépôt en cours…" : "Déposer un document"}
              <input
                type="file"
                accept=".pdf,.txt,.csv,.png,.jpg,.jpeg,.xlsx"
                disabled={disabled || preview || uploading || resources.length >= 12}
                onChange={(event) => {
                  void upload(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {uploadError && <p role="alert">{uploadError}</p>}
            <small>
              4 Mo maximum. Les fichiers sont conservés dans les documents de l’espace ; les droits
              de cet espace s’appliquent. PDF, TXT et CSV permettent la lecture du texte par
              l’agent.
            </small>
          </div>
          <small>{resources.length}/12 ressources · Sauvegarde automatique des liens.</small>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SkillTagsProperty({
  tags,
  disabled,
  onChange,
}: {
  tags: string[];
  disabled: boolean;
  onChange: (tags: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const clean = search.trim().slice(0, 30);
  const canCreate = !!clean && !tags.includes(clean) && tags.length < 8;
  function add() {
    if (canCreate) {
      onChange([...tags, clean]);
      setSearch("");
    }
  }
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={styles.tagTrigger}
          disabled={disabled}
          aria-label="Modifier les étiquettes"
        >
          {tags.length ? (
            tags.map((tag, index) => (
              <span className={styles.tagPill} data-color={index % 5} key={tag}>
                {tag}
              </span>
            ))
          ) : (
            <span className={styles.emptyProperty}>Vide</span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.resourcePopover}
          sideOffset={4}
          align="start"
          collisionPadding={12}
        >
          <label>
            <Search size={15} />
            <input
              aria-label="Rechercher ou créer une étiquette"
              placeholder="Rechercher ou créer une étiquette…"
              value={search}
              maxLength={30}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
                if (event.key === "Backspace" && !search && tags.length)
                  onChange(tags.slice(0, -1));
              }}
            />
          </label>
          <p>Sélectionnées</p>
          {tags
            .filter((tag) => tag.toLowerCase().includes(search.toLowerCase()))
            .map((tag, index) => (
              <div className={styles.resourceSelected} key={tag}>
                <span>
                  <span className={styles.tagPill} data-color={index % 5}>
                    {tag}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Retirer l’étiquette ${tag}`}
                  onClick={() => onChange(tags.filter((value) => value !== tag))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          {canCreate && (
            <button type="button" className={styles.resourceResult} onClick={add}>
              Créer <span className={styles.tagPill}>{clean}</span>
            </button>
          )}
          <small>{tags.length}/8 étiquettes · Entrée pour créer</small>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
