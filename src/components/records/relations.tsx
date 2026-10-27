"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import { Search, Plus, Check, X, Link2 } from "lucide-react";
import { request, useSave, useWorkspace } from "../providers/data-provider";
import { CompanyLogo } from "./company-logo";
import { workspaceHref } from "@/lib/domain/workspace-navigation";
import { linksForRecord, type RecordLinks, type LinkedRecord } from "@/lib/domain/record-links";
import type { CrmRecord } from "@/lib/domain/types";
import styles from "./relations.module.css";

const RelationContext = createContext<{
  data?: RecordLinks;
  error: Error | null;
  loading: boolean;
  targetId?: string;
  target: "companies" | "people";
  busy: boolean;
  retry: () => void;
  add: (record: CrmRecord, other: LinkedRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
} | null>(null);
export function RecordRelationsProvider({
  records,
  slug,
  children,
}: {
  records: CrmRecord[];
  slug: string;
  children: ReactNode;
}) {
  const { workspace, objects } = useWorkspace();
  const mutation = useSave();
  const [removing, setRemoving] = useState(false);
  const target = slug === "companies" ? "people" : "companies";
  const targetId = objects.find((object) => object.slug === target)?.id;
  const ids = records
    .map((record) => record.id)
    .sort()
    .join(",");
  const query = useQuery({
    queryKey: ["rows", workspace.id, "record-links", targetId, ids],
    enabled: !!ids && !!targetId && ["people", "companies"].includes(slug),
    queryFn: () =>
      request<RecordLinks>(`/api/${workspace.id}/record-links?ids=${ids}&object_id=${targetId}`),
  });
  return (
    <RelationContext.Provider
      value={{
        data: query.error ? undefined : query.data,
        error: query.error,
        loading: !!targetId && !!ids && query.isPending,
        target,
        targetId,
        busy: mutation.busy || removing,
        retry: () => {
          void query.refetch();
        },
        add: async (record, other) => {
          if (workspace.role === "viewer" || record.merged_into || record.archived)
            throw new Error("Cette fiche est en lecture seule.");
          if (linksForRecord(query.data, record.id).some((value) => value.record.id === other.id))
            return;
          await mutation.save("record_relations", {
            source_id: slug === "companies" ? other.id : record.id,
            target_id: slug === "companies" ? record.id : other.id,
            label: "Travaille chez",
          });
        },
        remove: async (id) => {
          if (workspace.role === "viewer") throw new Error("Vous avez un accès en lecture seule.");
          if (!query.data?.links.some((link) => link.id === id))
            throw new Error("Relation inaccessible.");
          setRemoving(true);
          try {
            await mutation.remove("record_relations", id);
          } finally {
            setRemoving(false);
          }
        },
      }}
    >
      {children}
    </RelationContext.Provider>
  );
}

export function RecordRelationsCell({ record }: { record: CrmRecord }) {
  const state = useContext(RelationContext);
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [error, setError] = useState("");
  const candidates = useQuery({
    queryKey: ["rows", workspace.id, "relation-picker", state?.targetId, search],
    enabled: open && !!state?.targetId,
    queryFn: () =>
      request<{ data: LinkedRecord[]; count: number }>(
        `/api/${workspace.id}/records?object_id=${state?.targetId}&size=25&q=${encodeURIComponent(search.trim())}`,
      ),
  });
  if (!state) return null;
  const linked = linksForRecord(state.data, record.id);
  const label = state.target === "companies" ? "Entreprises" : "Contacts";
  const readonly = workspace.role === "viewer" || !!record.merged_into || record.archived;
  const disabled =
    readonly || state.busy || state.loading || !!state.error || !!state.data?.partial;
  const path = (id: string) => workspaceHref(`/app/${state.target}?record=${id}`, workspace.id);
  return (
    <div className={styles.relationCell} onClick={(event) => event.stopPropagation()}>
      {linked.slice(0, 2).map(({ record: other, link }) => (
        <span className={styles.chip} key={link.id}>
          {state.target === "companies" && (
            <CompanyLogo name={other.display_name} domain={other.domain} size={20} />
          )}
          <Link href={path(other.id)}>{other.display_name}</Link>
        </span>
      ))}
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            if (state.error) state.retry();
            setSearch("");
            setError("");
          }
        }}
      >
        <Popover.Trigger
          type="button"
          className={styles.relationTrigger}
          aria-label={`${label} de ${record.display_name}`}
        >
          {state.loading ? (
            "Chargement…"
          ) : state.error ? (
            "Réessayer"
          ) : linked.length > 2 ? (
            `+ ${linked.length - 2}`
          ) : linked.length ? (
            <Plus size={13} />
          ) : (
            <>
              <Link2 size={13} />
              Lier
            </>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className={styles.picker}
            align="start"
            sideOffset={5}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <strong>
                {label} de {record.display_name}
              </strong>
              <Popover.Close className="icon-button" aria-label="Fermer les relations">
                <X size={15} />
              </Popover.Close>
            </header>
            <label className={styles.search}>
              <Search size={14} />
              <input
                aria-label={`Rechercher des ${label.toLowerCase()}`}
                placeholder={
                  state.target === "companies"
                    ? "Nom, site ou e-mail d’une entreprise…"
                    : "Nom ou e-mail d’un contact…"
                }
                value={search}
                maxLength={200}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {linked.length > 0 && (
              <div className={styles.linked}>
                <small>Liés · {linked.length}</small>
                {linked.map(({ record: other, link }) => (
                  <div key={link.id}>
                    <Link href={path(other.id)}>{other.display_name}</Link>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Dissocier ${other.display_name}`}
                      onClick={async () => {
                        setError("");
                        try {
                          await state.remove(link.id);
                        } catch (cause) {
                          setError(
                            cause instanceof Error ? cause.message : "Dissociation impossible.",
                          );
                        }
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {state.error && <p role="alert">Chargement des relations impossible.</p>}
            {state.data?.partial && (
              <p>Plus de 500 liens sur cette page. Affinez la liste pour modifier les relations.</p>
            )}
            {!state.targetId && (
              <p>Ajoutez d’abord l’objet {label.toLowerCase()} dans cet espace.</p>
            )}
            <div className={styles.candidates}>
              {candidates.isFetching ? (
                <p>Recherche…</p>
              ) : candidates.error ? (
                <p role="alert">La recherche a échoué.</p>
              ) : (
                candidates.data?.data
                  .filter((other) => other.id !== record.id)
                  .map((other) => {
                    const selected = linked.some((value) => value.record.id === other.id);
                    return (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        disabled={disabled || selected}
                        key={other.id}
                        onClick={async () => {
                          setError("");
                          try {
                            await state.add(record, other);
                          } catch (cause) {
                            setError(
                              cause instanceof Error ? cause.message : "Relation impossible.",
                            );
                          }
                        }}
                      >
                        {state.target === "companies" ? (
                          <CompanyLogo
                            name={other.display_name}
                            domain={other.domain}
                            size={24}
                            interactive={false}
                          />
                        ) : (
                          <span className={styles.person}>{other.display_name.slice(0, 1)}</span>
                        )}
                        <span className={styles.candidateText}>
                          <strong>{other.display_name}</strong>
                          <small>{other.domain || other.email}</small>
                        </span>
                        {selected ? <Check size={15} /> : <Plus size={14} />}
                      </button>
                    );
                  })
              )}
              {!candidates.isFetching &&
                !candidates.error &&
                candidates.data?.data.length === 0 && <p>Aucun résultat. Affinez la recherche.</p>}
            </div>
            {error && <p role="alert">{error}</p>}
            <footer>
              {readonly ? "Lecture seule" : "Le lien apparaît automatiquement sur les deux fiches."}
              {(candidates.data?.count ?? 0) > 25 && " · 25 résultats, affinez la recherche."}
            </footer>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export function RecordRelationsField({ record, slug }: { record: CrmRecord; slug: string }) {
  if (!["people", "companies"].includes(slug)) return null;
  return (
    <RecordRelationsProvider records={[record]} slug={slug}>
      <div className={styles.field}>
        <span>{slug === "people" ? "Entreprises" : "Contacts"}</span>
        <RecordRelationsCell record={record} />
      </div>
    </RecordRelationsProvider>
  );
}
