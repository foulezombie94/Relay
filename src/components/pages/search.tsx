"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { recordHref, workspaceHref } from "@/lib/domain/workspace-navigation";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace, request } from "../providers/data-provider";
import { PageHeader, SearchBox, Empty, Loading, ErrorMessage, date } from "../ui";
type SearchResult = {
  id: string;
  object_id?: string;
  record_id?: string;
  title: string;
  excerpt: string;
  private: boolean;
  date?: string;
  status?: string;
};
type SearchResponse = {
  groups: { resource: string; count: number; results: SearchResult[] }[];
  related: { id: string; object_id: string; display_name: string }[];
};
const labels: Record<string, string> = {
  records: "Fiches",
  notes: "Notes",
  tasks: "Tâches",
  commitments: "Engagements",
  meetings: "Réunions",
};
export function SearchPage() {
  const { workspace, objects } = useWorkspace();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [scope, setScope] = useState("all");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(timer);
  }, [term]);
  const q = useQuery({
    queryKey: ["rows", workspace.id, "global-search", debounced, scope],
    enabled: debounced.length >= 2,
    queryFn: () =>
      request<SearchResponse>(
        "/api/" + workspace.id + "/search?" + new URLSearchParams({ q: debounced, scope }),
      ),
  });
  function recordLink(id: string, objectId: string) {
    const object = objects.find((o) => o.id === objectId);
    return object ? recordHref(workspace.id, object, id) : null;
  }
  return (
    <>
      <PageHeader
        title="Recherche globale"
        description="Retrouvez fiches, notes, tâches, engagements et réunions dans votre espace."
      />
      <div className="toolbar">
        <SearchBox value={term} onChange={setTerm} />
        <select
          style={{ width: "auto" }}
          aria-label="Rechercher dans"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">Tout le contexte</option>
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage error={q.error} />
      {debounced.length < 2 ? (
        <Empty
          title="Que cherchez-vous ?"
          description="Saisissez au moins deux caractères. Vous pouvez chercher une expression entre guillemets ou exclure un mot avec un signe moins."
        />
      ) : q.isPending ? (
        <Loading />
      ) : (
        q.data && (
          <>
            {q.data.groups.every((g) => !g.count) && <Empty title="Aucun résultat accessible" />}
            {q.data.groups
              .filter((g) => g.count > 0)
              .map((group) => (
                <section key={group.resource}>
                  <h2 className="section-title">
                    {labels[group.resource]}{" "}
                    <small>
                      {group.count} résultat{group.count > 1 ? "s" : ""}
                    </small>
                  </h2>
                  <div className="stack">
                    {group.results.map((result) => {
                      const linked = result.object_id
                        ? {
                            id: result.id,
                            object_id: result.object_id,
                            display_name: result.title,
                          }
                        : q.data.related.find((r) => r.id === result.record_id);
                      const href = linked ? recordLink(linked.id, linked.object_id) : null;
                      return (
                        <article key={result.id} className="detail-card">
                          <div className="card-head">
                            <h3>{result.title}</h3>
                            <small>{date(result.date)}</small>
                          </div>
                          {result.private && <span className="pill">Votre note privée</span>}
                          <p className="preserve-lines">
                            {result.excerpt}
                            {result.excerpt.length === 500 ? "…" : ""}
                          </p>
                          <div className="row-actions">
                            {href && (
                              <Link className="button small" href={href}>
                                {group.resource === "records"
                                  ? "Ouvrir la fiche"
                                  : "Fiche liée · " + linked!.display_name}
                              </Link>
                            )}
                            {group.resource !== "records" && (
                              <Link
                                className="button small"
                                href={workspaceHref("/app/" + group.resource, workspace.id)}
                              >
                                Ouvrir {labels[group.resource].toLowerCase()}
                              </Link>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {group.count > 25 && (
                    <p className="footer-note">
                      25 résultats affichés dans cette catégorie. Affinez votre recherche.
                    </p>
                  )}
                </section>
              ))}
          </>
        )
      )}
      <p className="footer-note">
        Les résultats suivent vos droits actuels. Les notes privées des autres membres sont exclues.
      </p>
    </>
  );
}
