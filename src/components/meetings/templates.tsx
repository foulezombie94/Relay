"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request } from "@/lib/api/request";
import { MeetingInsights } from "./insights";
import { Plus, FileText, Archive, Pencil, Trash2, Sparkles, ArrowUpRight } from "lucide-react";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { Empty, ErrorMessage, Loading, Modal } from "../ui";
import { Pagination } from "../ui/pagination";
import {
  meetingLibrarySchema,
  insightPresets,
  insightTemplateSchema,
  type InsightSection,
  type InsightTemplate,
} from "@/lib/domain/meetings";
import styles from "./meetings.module.css";
import { DeleteButton } from "@/components/ui/delete-button";

export function InsightTemplates() {
  const { workspace, user } = useWorkspace();
  const [page, setPage] = useState(0),
    [state, setState] = useState("published"),
    [edit, setEdit] = useState<InsightTemplate | true | null>(null),
    [preset, setPreset] = useState(0),
    [deleteBusy, setDeleteBusy] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const q = useRows<InsightTemplate>("meeting_insight_templates", {
    size: 24,
    page,
    status: state,
  });
  const { save, remove, busy } = useSave();
  const rows = !q.isError ? (q.data?.data ?? []) : [];
  const canEdit = (t: InsightTemplate) =>
    workspace.role !== "viewer" &&
    (t.created_by === user.id || ["owner", "admin"].includes(workspace.role));
  return (
    <div className={styles.templates}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>Une analyse adaptée à chaque échange</h2>
          <p>
            Définissez les questions importantes. Gardez des résumés cohérents dans votre équipe.
          </p>
        </div>
        <button
          className="button primary"
          disabled={workspace.role === "viewer"}
          onClick={() => {
            setPreset(0);
            setEdit(true);
          }}
        >
          <Plus size={15} />
          Nouveau modèle
        </button>
      </div>
      <div className={styles.presets}>
        {insightPresets.map((item, i) => (
          <button
            key={item.name}
            disabled={workspace.role === "viewer"}
            onClick={() => {
              setPreset(i);
              setEdit(true);
            }}
          >
            <span>
              <Sparkles size={18} />
            </span>
            <strong>{item.name}</strong>
            <small>{item.sections.length} sections</small>
            <ArrowUpRight size={15} />
          </button>
        ))}
      </div>
      <div className={styles.templateStates} aria-label="État des modèles">
        {[
          ["published", "Publiés"],
          ["draft", "Brouillons"],
          ["archived", "Archivés"],
        ].map(([value, label]) => (
          <button
            className="button small"
            key={value}
            aria-pressed={state === value}
            onClick={() => {
              setState(value);
              setPage(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorMessage error={q.error} />
      <ErrorMessage error={error} />
      {q.isPending ? (
        <Loading />
      ) : !rows.length ? (
        <Empty
          title="Créez votre premier modèle"
          description="Commencez avec un modèle proposé, puis adaptez les questions à votre équipe."
        />
      ) : (
        <div className={styles.templateGrid}>
          {rows.map((t) => (
            <article key={t.id}>
              <span className={styles.templateIcon}>
                <FileText size={22} />
              </span>
              <h3>{t.name}</h3>
              <p>{t.sections.map((s) => s.title).join(" · ")}</p>
              <small>
                {t.sections.length} sections ·{" "}
                {t.status === "published"
                  ? "Disponible pour l’équipe"
                  : t.status === "draft"
                    ? "Brouillon privé"
                    : "Archivé"}
              </small>
              {canEdit(t) && (
                <footer>
                  <button className="button small" onClick={() => setEdit(t)}>
                    <Pencil size={13} />
                    Modifier
                  </button>
                  <button
                    className="icon-button"
                    title={t.status === "archived" ? "Restaurer" : "Archiver"}
                    aria-label={`${t.status === "archived" ? "Restaurer" : "Archiver"} ${t.name}`}
                    disabled={busy}
                    onClick={async () => {
                      setError(null);
                      try {
                        await save(
                          "meeting_insight_templates",
                          { status: t.status === "archived" ? "published" : "archived" },
                          t,
                        );
                      } catch (err) {
                        setError(err as Error);
                      }
                    }}
                  >
                    <Archive size={14} />
                  </button>
                  <DeleteButton
                    label={`Supprimer ${t.name}`}
                    title="Les analyses déjà réalisées restent dans votre historique"
                    disabled={deleteBusy}
                    onConfirm={async () => {
                      if (deleteBusy) return;
                      setDeleteBusy(true);
                      try {
                        await remove("meeting_insight_templates", t.id);
                      } catch (err) {
                        setError(err as Error);
                      } finally {
                        setDeleteBusy(false);
                      }
                    }}
                  />
                </footer>
              )}
            </article>
          ))}
        </div>
      )}
      <Pagination
        page={page}
        size={24}
        total={!q.isError ? (q.data?.count ?? 0) : 0}
        onChange={setPage}
      />
      {edit && (
        <TemplateEditor
          template={edit === true ? undefined : edit}
          preset={preset}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}
function TemplateEditor({
  template,
  preset,
  onClose,
}: {
  template?: InsightTemplate;
  preset: number;
  onClose: () => void;
}) {
  const { save, busy } = useSave();
  const [name, setName] = useState(template?.name ?? insightPresets[preset].name),
    [sections, setSections] = useState<InsightSection[]>(
      template?.sections ?? insightPresets[preset].sections,
    ),
    [error, setError] = useState<Error | null>(null);
  function update(index: number, patch: Partial<InsightSection>) {
    setSections(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  async function persist(status: string) {
    setError(null);
    try {
      const values = insightTemplateSchema.parse({ name, sections, status });
      await save("meeting_insight_templates", values, template);
      onClose();
    } catch (err) {
      setError(err as Error);
    }
  }
  return (
    <Modal
      open
      wide
      title={template ? "Modifier le modèle" : "Nouveau modèle d’analyse"}
      description="Chaque section définit une question et un format. L’analyse cite la réunion choisie et reste dans votre historique privé."
      onClose={onClose}
      className={styles.modal}
    >
      <div className={styles.templateLayout}>
        <div className={styles.templateEditor}>
          <label>
            Nom du modèle
            <input maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {!template && (
            <label>
              Point de départ
              <select
                defaultValue={preset}
                onChange={(e) => {
                  const p = insightPresets[Number(e.target.value)];
                  setName(p.name);
                  setSections(p.sections);
                }}
              >
                {insightPresets.map((p, i) => (
                  <option value={i} key={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {sections.map((section, i) => (
            <section key={i} className={styles.sectionEditor}>
              <div>
                <strong>Section {i + 1}</strong>
                <button
                  className="icon-button"
                  aria-label={`Retirer la section ${i + 1}`}
                  disabled={sections.length === 1}
                  onClick={() => setSections(sections.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <label>
                Titre de la section {i + 1}
                <input
                  maxLength={100}
                  value={section.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                />
              </label>
              <label>
                Question de la section {i + 1}
                <textarea
                  rows={2}
                  maxLength={450}
                  value={section.prompt}
                  onChange={(e) => update(i, { prompt: e.target.value })}
                />
              </label>
              <label>
                Format de la section {i + 1}
                <select
                  value={section.format}
                  onChange={(e) => update(i, { format: e.target.value as "text" | "list" })}
                >
                  <option value="text">Texte</option>
                  <option value="list">Liste</option>
                </select>
              </label>
            </section>
          ))}
          <button
            className="button"
            disabled={sections.length >= 6}
            onClick={() =>
              setSections([
                ...sections,
                {
                  title: "Nouvelle section",
                  prompt: "Résume les points importants de cette section.",
                  format: "list",
                },
              ])
            }
          >
            <Plus size={14} />
            Ajouter une section
          </button>
          <p className={styles.muted}>
            Après publication, choisissez ce modèle dans une réunion pour générer une analyse avec
            des citations vérifiées.
          </p>
          <ErrorMessage error={error} />
        </div>
        <TemplatePreview sections={sections} />
      </div>
      <div className="dialog-actions">
        <button className="button" disabled={busy} onClick={() => void persist("draft")}>
          Enregistrer le brouillon
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void persist("published")}
        >
          Publier le modèle
        </button>
      </div>
    </Modal>
  );
}
function TemplatePreview({ sections }: { sections: InsightSection[] }) {
  const { workspace } = useWorkspace();
  const [search, setSearch] = useState(""),
    [term, setTerm] = useState(""),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["rows", workspace.id, "meeting-template-preview", term, page],
    queryFn: async () =>
      meetingLibrarySchema.parse(
        await request(
          `/api/${workspace.id}/meetings/library?view=calls&page=${page}&q=${encodeURIComponent(term)}`,
        ),
      ),
    retry: false,
  });
  const rows = !query.isError ? (query.data?.data ?? []) : [];
  const chosen = rows.find((r) => r.id === selected);
  return (
    <aside className={styles.preview}>
      <h3>Aperçu sur un appel</h3>
      <p className={styles.muted}>
        Essayez vos questions avant publication. La génération utilise votre quota IA.
      </p>
      <input
        aria-label="Rechercher un appel pour l’aperçu"
        placeholder="Rechercher une réunion…"
        maxLength={200}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        aria-label="Réunion pour l’aperçu"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Choisir un appel</option>
        {rows
          .filter((r) => r.kind === "meeting" && (r.has_transcript || r.summary))
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
      </select>
      <ErrorMessage error={query.error} />
      <Pagination
        page={page}
        size={25}
        total={!query.isError ? (query.data?.count ?? 0) : 0}
        onChange={setPage}
      />
      {chosen && (
        <MeetingInsights
          key={chosen.id + JSON.stringify(sections)}
          id={chosen.id}
          hasSource={chosen.has_transcript || !!chosen.summary}
          previewSections={sections}
        />
      )}
    </aside>
  );
}
