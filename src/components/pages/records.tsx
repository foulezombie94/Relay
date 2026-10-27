"use client";
import Link from "next/link";
import { recordHref, workspaceHref } from "@/lib/domain/workspace-navigation";
import { ViewButtons } from "../ui/view-buttons";
import { MonthCalendar } from "../ui/month-calendar";
import { List, LayoutGrid, Columns3, CalendarDays } from "lucide-react";
import { RecordSegments } from "../records/segments";
import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RecordViews } from "../records/views";
import { defaultRecordView, type ViewConfig } from "@/lib/domain/views";
import { request, useRows, useSave, useWorkspace } from "../providers/data-provider";
import {
  PageHeader,
  AddButton,
  Editor,
  Loading,
  ErrorMessage,
  Empty,
  money,
  str,
  SearchBox,
  type Field,
} from "../ui";
import { RecordDetails } from "./record-details";
import { RecordQuickPeek } from "../records/quick-peek";
import { ContactsToolbar } from "../records/contacts-toolbar";
import { ContactsTable } from "../records/contacts-table";
import { RecordRelationsProvider, RecordRelationsCell } from "../records/relations";
import { contactColumns, contactPatch, contactAttributeKey } from "../records/contacts-model";
import contactStyles from "../records/contacts.module.css";
import { RecordBoard } from "../records/board";
import { RecordDirectory } from "../records/directory";
import { RecordTable } from "../records/table";
import { ImportRecords } from "../records/import";
import { ExportRecords } from "../records/export";
import { type Pipeline } from "@/lib/domain/pipelines";
import type { CrmRecord, Attribute } from "@/lib/domain/types";
import { stages } from "@/lib/domain/types";
import { Building2, Users, Layers3 } from "lucide-react";
import styles from "../records/records.module.css";
import { ObjectStudio, StudioTrigger } from "../records/studio/object-studio";
import { TemplateMenu } from "../records/studio/template-menu";
import { useStudio, useStudioActions } from "../records/studio/use-studio";
import type { StudioConfig, StudioKind } from "@/lib/domain/record-studio";
export function RecordsPage({ slug }: { slug: string }) {
  const { workspace } = useWorkspace();
  const url = useSearchParams();
  return (
    <RecordsPageContents
      key={workspace.id + ":" + slug + ":" + (url.get("pipeline") ?? "")}
      slug={slug}
    />
  );
}
function RecordsPageContents({ slug }: { slug: string }) {
  const { objects, workspace } = useWorkspace();
  const object = objects.find((o) => o.slug === slug);
  const studio = useStudio(["people", "companies"].includes(slug) ? object?.id : undefined);
  const studioActions = useStudioActions();
  const [studioKind, setStudioKind] = useState<StudioKind | null>(null);
  const [template, setTemplate] = useState<Extract<StudioConfig, { kind: "template" }> | null>(
    null,
  );
  const [templateBusy, setTemplateBusy] = useState(false);
  const templateAttempt = useRef("");
  const router = useRouter();
  const url = useSearchParams();
  const linkedId = url.get("record");
  const pipelineFromUrl = url.get("pipeline") ?? "";
  const pipelines = useRows<Pipeline>("pipelines", { size: 100 });
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ViewConfig>(() => ({
    ...defaultRecordView(slug),
    pipeline_id: slug === "deals" ? pipelineFromUrl : "",
  }));
  const pageContent = {
    companies: {
      description: "Vos comptes clients et prospects, avec leur contexte et leurs coordonnées.",
      action: "Nouvelle entreprise",
      single: "entreprise",
      plural: "entreprises",
      name: "Nom de l’entreprise",
      icon: Building2,
    },
    people: {
      description:
        "Les personnes avec qui vous échangez. Retrouvez leurs coordonnées et le fil de la relation.",
      action: "Nouvelle personne",
      single: "personne",
      plural: "personnes",
      name: "Nom complet",
      icon: Users,
    },
    deals: {
      description: "Votre pipeline commercial, de la qualification à la signature.",
      action: "Nouvelle opportunité",
      single: "opportunité",
      plural: "opportunités",
      name: "Nom de l’opportunité",
      icon: Layers3,
    },
  }[slug] ?? {
    description: "Vos fiches et leur contexte, dans un espace commun.",
    action: "Nouvelle fiche",
    single: "fiche",
    plural: "fiches",
    name: "Nom",
    icon: Layers3,
  };
  const PageIcon = pageContent.icon;
  const search = view.search;
  const filtered = !!(
    search.trim() ||
    view.stage ||
    view.owner ||
    view.minimum ||
    view.pipeline_id ||
    view.filters?.length
  );
  function clearFilters() {
    setView((current) => ({
      ...current,
      search: "",
      stage: "",
      owner: "",
      minimum: "",
      pipeline_id: "",
      filters: [],
    }));
    setPage(1);
    const query = new URLSearchParams(url.toString());
    query.delete("pipeline");
    window.history.replaceState(
      null,
      "",
      workspaceHref(
        "/app/" + (object?.standard ? slug : "object-" + slug) + "?" + query + window.location.hash,
        workspace.id,
      ),
    );
  }
  const [mode, setMode] = useState(slug === "deals" ? "kanban" : "table");
  function chooseMode(value: string) {
    const next =
      value === "kanban" && slug !== "deals"
        ? "cards"
        : value === "calendar" && slug !== "deals"
          ? "table"
          : value;
    setMode(next);
    setView((current) => ({
      ...current,
      layout: next as ViewConfig["layout"],
    }));
  }
  const [newStage, setNewStage] = useState("Nouveau");
  const [edit, setEdit] = useState<CrmRecord | true | null>(null);
  const [selectedDetail, setDetail] = useState<CrmRecord | null>(null);
  const [previewId, setPreviewId] = useState("");
  const linked = useQuery({
    queryKey: ["rows", workspace.id, "record-link", linkedId],
    enabled: !!linkedId,
    queryFn: async () => {
      const active = await request<{ data: CrmRecord[] }>(
        "/api/" + workspace.id + "/records?id=" + linkedId,
      );
      return active.data.length
        ? active
        : request<{ data: CrmRecord[] }>(
            "/api/" + workspace.id + "/records?id=" + linkedId + "&archived=true",
          );
    },
  });
  const [dismissedLink, setDismissedLink] = useState<string | null>(null);
  const linkedRecord = linked.data?.data[0];
  const detail =
    selectedDetail ??
    (linkedId !== dismissedLink &&
    linkedRecord?.object_id === object?.id &&
    !linkedRecord?.archived &&
    !linkedRecord?.merged_into
      ? (linkedRecord ?? null)
      : null);
  useEffect(() => {
    const r = linked.data?.data[0];
    if (r && r.object_id === object?.id) {
      if (r.merged_into) router.replace(recordHref(workspace.id, object, r.merged_into));
    }
  }, [linked.data, object, router, workspace.id]);
  const [importing, setImporting] = useState(() => url.get("import") === "1");
  const [lost, setLost] = useState<CrmRecord | null>(null);
  const [error, setError] = useState("");
  const [property, setProperty] = useState<Attribute | true | null>(null);
  const q = useRows<CrmRecord>("records", {
    object_id: object?.id,
    pipeline_id: slug === "deals" ? view.pipeline_id || undefined : undefined,
    q: search || undefined,
    stage: view.stage || undefined,
    owner: view.owner || undefined,
    minimum: view.minimum || undefined,
    filters: view.filters?.length ? JSON.stringify(view.filters) : undefined,
    sort: view.sort,
    direction: view.direction,
    page: page - 1,
    size: 50,
  });
  const members = useRows("memberships", { size: 100 });
  const attrs = useRows<Attribute>("attributes", {
    object_id: object?.id,
    size: 100,
  });
  const { save, busy } = useSave();
  const fields: Field[] = [
    { key: "display_name", label: pageContent.name, required: true },
    { key: "email", label: "Email", type: "email" },
    { key: "domain", label: "Site internet" },
    {
      key: "owner_id",
      label: "Responsable",
      type: "select",
      options: (members.data?.data ?? []).map((m) => ({
        value: str(m.user_id),
        label: str(m.display_name) || str(m.user_id),
      })),
    },
  ];
  if (slug === "deals")
    fields.push(
      {
        key: "stage",
        label: "Étape",
        type: "select",
        options: stages.map((s) => ({ value: s, label: s })),
      },
      {
        key: "pipeline_id",
        label: "Pipeline",
        type: "select",
        required: true,
        options: (pipelines.data?.data ?? []).map((p) => ({
          value: p.id,
          label: p.name,
        })),
      },
      { key: "amount", label: "Montant", type: "number" },
      {
        key: "use_stage_probability",
        label: "Utiliser la probabilité de cette étape",
        type: "checkbox",
      },
      {
        key: "probability",
        label: "Probabilité spécifique (%) · sinon étape",
        type: "number",
      },
      {
        key: "lost_reason",
        label: "Raison de perte · obligatoire si Perdu",
        type: "textarea",
      },
      { key: "currency", label: "Devise", required: true },
      { key: "close_date", label: "Date de clôture", type: "date" },
    );
  const custom = (attrs.data?.data ?? []).filter((a) => !a.archived);
  for (const a of custom)
    fields.push({
      key: "attr_" + a.key,
      label: a.name,
      required: a.required,
      type:
        a.type === "boolean"
          ? "checkbox"
          : a.type === "number" || a.type === "money"
            ? "number"
            : a.type === "select"
              ? "select"
              : a.type === "date"
                ? "date"
                : a.type === "datetime"
                  ? "datetime-local"
                  : a.type === "email"
                    ? "email"
                    : a.type === "phone"
                      ? "tel"
                      : a.type === "multi_select"
                        ? "json"
                        : "text",
      options: (a.options ?? []).map((v) => ({ value: v, label: v })),
    });
  if (!object) return <Loading />;
  const rows = q.data?.data ?? [];
  const contactFields = contactColumns(custom, slug);
  const manageProperties = workspace.role === "owner" || workspace.role === "admin";
  function changeContactView(value: ViewConfig) {
    setView(value);
    setPage(1);
  }
  const preview = q.error ? undefined : rows.find((record) => record.id === previewId);
  const exportParams = new URLSearchParams({
    object_id: object.id,
    q: search,
    stage: view.stage,
    owner: view.owner,
    minimum: view.minimum,
    sort: view.sort,
    direction: view.direction,
    columns: view.columns.join(","),
    filters: JSON.stringify(view.filters ?? []),
    pipeline_id: slug === "deals" ? view.pipeline_id : "",
  });
  const exportControl = (
    <ExportRecords
      key={"export:" + object.id}
      workspaceId={workspace.id}
      objectName={object.name}
      slug={slug}
      params={exportParams}
      columns={view.columns}
      attributes={custom}
      count={q.data?.count ?? 0}
      compact={slug === "people"}
    />
  );
  const manageStudio = ["owner", "admin"].includes(workspace.role);
  const createControl = ["people", "companies"].includes(slug) ? (
    <TemplateMenu
      readonly={workspace.role === "viewer"}
      templates={(studio.data?.data ?? []).filter(
        (c) => c.kind === "template" && c.object_id === object.id,
      )}
      onCreate={() => {
        setTemplate(null);
        setNewStage("Nouveau");
        setEdit(true);
      }}
      onTemplate={(selected) => {
        setTemplate(selected);
        templateAttempt.current = crypto.randomUUID();
        setEdit(true);
      }}
      canManage={manageStudio}
      onManage={() => setStudioKind("template")}
    />
  ) : null;
  const viewControls = (
    <RecordViews
      key={"views:" + object.id}
      compact={slug === "people"}
      object={object}
      attributes={custom}
      config={view}
      mode={mode}
      onMode={chooseMode}
      onChange={(value) => {
        setView(value);
        setPage(1);
      }}
    />
  );
  return (
    <RecordRelationsProvider records={rows} slug={slug}>
      <div className={slug === "people" ? contactStyles.page : undefined}>
        {slug === "people" ? (
          <h1 className={contactStyles.heading}>Répertoire des contacts</h1>
        ) : (
          <div className={`${styles.pageHeading} ${styles[slug] ?? ""}`}>
            <span className={styles.pageIcon}>
              <PageIcon size={24} strokeWidth={1.6} />
            </span>
            <PageHeader
              title={object.name}
              description={pageContent.description}
              action={
                createControl ?? (
                  <AddButton
                    label={pageContent.action}
                    disabled={workspace.role === "viewer"}
                    onClick={() => {
                      setNewStage("Nouveau");
                      setEdit(true);
                    }}
                  />
                )
              }
            />
          </div>
        )}
        {slug === "people" && (
          <ContactsToolbar
            config={view}
            onChange={changeContactView}
            mode={mode}
            onMode={chooseMode}
            columns={contactFields.filter((column) => column.key !== "relations")}
            members={members.error ? [] : (members.data?.data ?? [])}
            readonly={workspace.role === "viewer"}
            onCreate={() => setEdit(true)}
            onImport={() => setImporting(true)}
            exportControl={exportControl}
            viewControl={viewControls}
            createControl={createControl}
            customizeControl={
              manageStudio ? <StudioTrigger onClick={() => setStudioKind("layout")} /> : undefined
            }
          />
        )}
        {slug !== "people" && (
          <>
            <div className={styles.quickViews} role="group" aria-label="Vues rapides">
              {[
                {
                  value: "",
                  label:
                    slug === "deals"
                      ? "Toutes les opportunités"
                      : slug === "people"
                        ? "Tous les contacts"
                        : slug === "companies"
                          ? "Toutes les entreprises"
                          : "Toutes les fiches",
                },
                {
                  value: "me",
                  label:
                    slug === "deals"
                      ? "Mon pipeline"
                      : slug === "people"
                        ? "Mes contacts"
                        : slug === "companies"
                          ? "Mes comptes"
                          : "Mes fiches",
                },
                { value: "unassigned", label: "Sans responsable" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={view.owner === item.value}
                  onClick={() => {
                    setView((current) => ({ ...current, owner: item.value }));
                    setPage(1);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <RecordSegments
              value={view.filters ?? []}
              onChange={(filters) => {
                setPage(1);
                setView((current) => ({ ...current, filters }));
              }}
            />
            <div className="toolbar">
              <SearchBox
                value={search}
                onChange={(v) => {
                  setView((c) => ({ ...c, search: v }));
                  setPage(1);
                }}
              />
              <span className="pill">
                {q.data?.count ?? 0} {pageContent.plural}
              </span>
              <ViewButtons
                label="Présentation des fiches"
                value={mode}
                options={[
                  { value: "table", label: "Liste", icon: List },
                  slug === "deals"
                    ? { value: "kanban", label: "Kanban", icon: Columns3 }
                    : { value: "cards", label: "Galerie", icon: LayoutGrid },
                  ...(slug === "deals"
                    ? [{ value: "calendar", label: "Calendrier", icon: CalendarDays }]
                    : []),
                ]}
                onChange={chooseMode}
              />
              {exportControl}
              {slug === "companies" && manageStudio && (
                <StudioTrigger onClick={() => setStudioKind("layout")} />
              )}
              <button
                className="button small"
                disabled={workspace.role === "viewer"}
                onClick={() => setImporting(true)}
              >
                Importer
              </button>
            </div>
            {slug === "deals" && (
              <div className="toolbar">
                <label>
                  Pipeline
                  <select
                    aria-label="Pipeline affiché"
                    value={view.pipeline_id}
                    onChange={(e) => {
                      setView((current) => ({
                        ...current,
                        pipeline_id: e.target.value,
                      }));
                      setPage(1);
                    }}
                  >
                    <option value="">Tous les pipelines</option>
                    {pipelines.data?.data.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Link className="button small" href="/app/pipelines">
                  Paramètres du pipeline
                </Link>
              </div>
            )}
            {viewControls}
          </>
        )}
        {error && <div className="alert info">{error}</div>}
        <ErrorMessage error={q.error || linked.error || attrs.error || members.error} />
        {linkedId &&
          linked.data &&
          (!linked.data.data.length ||
            (linked.data.data[0]?.archived && !linked.data.data[0]?.merged_into)) && (
            <div className="alert info">Cette fiche est archivée ou inaccessible.</div>
          )}
        {q.isPending ? (
          <Loading />
        ) : slug === "people" && mode === "table" ? (
          <ContactsTable
            rows={q.error || attrs.error ? [] : rows}
            columns={contactFields}
            config={view}
            onChange={changeContactView}
            onOpen={setDetail}
            renderRelations={(record) => <RecordRelationsCell record={record} />}
            onCreate={() => setEdit(true)}
            readonly={workspace.role === "viewer" || busy}
            onAddProperty={manageProperties ? () => setProperty(true) : undefined}
            onEditProperty={
              manageProperties
                ? (column) => {
                    if (column.attribute) setProperty(column.attribute);
                  }
                : undefined
            }
            onSave={async (record, column, value) => {
              await save("records", contactPatch(record, column, value), record);
            }}
          />
        ) : mode === "calendar" ? (
          <MonthCalendar
            label="Calendrier des clôtures"
            note="Dates de clôture · Résultats de cette page (50 maximum)"
            items={(q.error ? [] : rows).map((record) => ({
              id: record.id,
              title: record.display_name,
              date: record.close_date,
              status: record.stage,
              detail: money(record.amount, record.currency),
            }))}
            onOpen={(id) => {
              setPreviewId(id);
            }}
          />
        ) : rows.length === 0 && mode !== "kanban" ? (
          <Empty
            title={
              filtered
                ? "Aucun résultat pour ces filtres"
                : `Aucune ${pageContent.single} pour le moment`
            }
            description={
              filtered
                ? "Modifiez votre recherche ou retirez les filtres pour retrouver vos fiches."
                : slug === "companies"
                  ? "Ajoutez une entreprise pour centraliser le suivi de ce compte."
                  : slug === "people"
                    ? "Ajoutez un contact pour retrouver vos échanges et ses coordonnées."
                    : "Ajoutez votre première opportunité pour suivre sa progression."
            }
            action={
              filtered ? (
                <button className="button" onClick={clearFilters}>
                  Effacer les filtres
                </button>
              ) : (
                <AddButton
                  label={pageContent.action}
                  disabled={workspace.role === "viewer"}
                  onClick={() => {
                    setNewStage("Nouveau");
                    setEdit(true);
                  }}
                />
              )
            }
          />
        ) : mode === "cards" ? (
          <RecordDirectory
            rows={rows}
            members={members.data?.data ?? []}
            slug={slug}
            onOpen={setDetail}
          />
        ) : mode === "kanban" ? (
          <RecordBoard
            rows={rows}
            members={members.data?.data ?? []}
            readonly={workspace.role === "viewer"}
            busy={busy}
            onOpen={(record) => setPreviewId(record.id)}
            onCreate={(stage) => {
              setNewStage(stage);
              setEdit(true);
            }}
            stageLabels={pipelines.data?.data.find((p) => p.id === view.pipeline_id)?.labels}
            onMove={async (record, stage) => {
              if (stage === "Perdu" && !record.lost_reason?.trim()) {
                setLost(record);
                return;
              }
              setError("");
              try {
                await save("records", { stage }, record);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Changement d’étape impossible.");
                throw err;
              }
            }}
          />
        ) : (
          <RecordTable
            renderRelations={(record) => <RecordRelationsCell record={record} />}
            rows={rows}
            columns={view.columns}
            custom={custom}
            slug={slug}
            onOpen={setDetail}
          />
        )}
        <div className="pagination">
          <span>
            Page {page}
            {mode === "kanban" ? " · Pipeline limité aux 50 résultats de cette page" : ""}
            {mode === "calendar" ? " · Calendrier limité aux 50 résultats de cette page" : ""}
          </span>
          <button
            className="button small"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </button>
          <button
            className="button small"
            disabled={page * 50 >= (q.data?.count ?? 0)}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </button>
        </div>
        {property && (
          <Editor
            open
            title={property === true ? "Nouvelle propriété de contact" : "Modifier la propriété"}
            onClose={() => setProperty(null)}
            busy={busy}
            fields={[
              { key: "name", label: "Nom de la propriété", required: true },
              ...(property === true
                ? [
                    {
                      key: "type",
                      label: "Type de propriété",
                      type: "select" as const,
                      options: [
                        { value: "text", label: "Texte" },
                        { value: "select", label: "Sélection" },
                        { value: "email", label: "E-mail" },
                        { value: "phone", label: "Téléphone" },
                        { value: "url", label: "Lien" },
                        { value: "number", label: "Nombre" },
                        { value: "date", label: "Date" },
                        { value: "boolean", label: "Case à cocher" },
                      ],
                    },
                  ]
                : []),
              {
                key: "options_input",
                label: "Options de sélection · une par ligne",
                type: "textarea",
              },
            ]}
            initial={
              property === true
                ? { type: "text" }
                : { name: property.name, options_input: (property.options ?? []).join("\n") }
            }
            onSave={async (values) => {
              if (!manageProperties)
                throw new Error("Vous ne pouvez pas modifier les propriétés de cet espace.");
              const type = property === true ? String(values.type || "text") : property.type;
              const options = [
                ...new Set(
                  String(values.options_input ?? "")
                    .split("\n")
                    .map((value) => value.trim())
                    .filter(Boolean),
                ),
              ];
              if (type === "select" && !options.length)
                throw new Error("Ajoutez au moins une option de sélection.");
              if (property === true) {
                const key = contactAttributeKey(
                  String(values.name),
                  custom.map((attribute) => attribute.key),
                );
                await save("attributes", {
                  object_id: object.id,
                  key,
                  name: values.name,
                  type,
                  required: false,
                  options: type === "select" ? options : [],
                });
                setView((current) => ({
                  ...current,
                  columns: [...current.columns, "attr_" + key],
                }));
              } else
                await save(
                  "attributes",
                  { name: values.name, ...(type === "select" ? { options } : {}) },
                  property,
                );
            }}
          />
        )}
        {preview && (
          <RecordQuickPeek
            record={preview}
            onClose={() => setPreviewId("")}
            onDetails={() => {
              setPreviewId("");
              setDetail(preview);
            }}
            onEdit={
              workspace.role === "viewer"
                ? undefined
                : () => {
                    setPreviewId("");
                    setEdit(preview);
                  }
            }
          />
        )}
        {edit && (
          <Editor
            key={edit === true ? (template?.id ?? "new") : edit.id}
            draftKey={`records:${object.id}:${edit === true ? (template?.id ?? "new") : edit.id}`}
            open
            onClose={() => {
              setEdit(null);
              setTemplate(null);
            }}
            title={
              edit === true
                ? template
                  ? "Créer depuis · " + template.name
                  : pageContent.action
                : "Modifier · " + edit.display_name
            }
            fields={fields}
            initial={
              edit === true
                ? {
                    currency: workspace.currency,
                    stage: newStage,
                    pipeline_id: view.pipeline_id || pipelines.data?.data[0]?.id,
                    use_stage_probability: true,
                    ...(template
                      ? {
                          ...template.config.values,
                          display_name: template.config.values.display_name || template.name,
                          ...Object.fromEntries(
                            Object.entries(template.config.values.attributes ?? {}).map(
                              ([key, value]) => ["attr_" + key, value],
                            ),
                          ),
                        }
                      : {}),
                  }
                : {
                    ...edit,
                    use_stage_probability: edit.probability == null,
                    ...Object.fromEntries(
                      custom.map((a) => ["attr_" + a.key, edit.attributes?.[a.key]]),
                    ),
                  }
            }
            busy={
              busy ||
              templateBusy ||
              attrs.isPending ||
              members.isPending ||
              !!attrs.error ||
              !!members.error
            }
            onSave={async (values) => {
              if (slug === "deals") {
                values.probability = values.use_stage_probability ? null : values.probability;
                delete values.use_stage_probability;
              }
              const attributes: Record<string, unknown> = {
                ...(edit === true ? {} : edit.attributes),
              };
              for (const a of custom) {
                if (values["attr_" + a.key] !== undefined)
                  attributes[a.key] = values["attr_" + a.key];
                else attributes[a.key] = null;
                delete values["attr_" + a.key];
              }
              if (template && edit === true) {
                setTemplateBusy(true);
                try {
                  await studioActions.create(
                    template.id,
                    {
                      ...values,
                      email: values.email ?? "",
                      domain: values.domain ?? "",
                      owner_id: values.owner_id || null,
                      attributes,
                    },
                    templateAttempt.current,
                  );
                } finally {
                  setTemplateBusy(false);
                }
                return;
              }
              await save(
                "records",
                {
                  ...values,
                  email: values.email ?? "",
                  domain: values.domain ?? "",
                  owner_id: values.owner_id ?? null,
                  attributes,
                  ...(edit === true ? { object_id: object.id } : {}),
                },
                edit === true ? undefined : edit,
              );
            }}
          />
        )}
        {importing && (
          <ImportRecords
            object={object}
            attributes={custom}
            pipelineId={
              slug === "deals" ? view.pipeline_id || pipelines.data?.data[0]?.id : undefined
            }
            onClose={() => setImporting(false)}
          />
        )}
        {lost && (
          <Editor
            open
            onClose={() => setLost(null)}
            title="Pourquoi cette opportunité est-elle perdue ?"
            fields={[
              {
                key: "lost_reason",
                label: "Raison de perte",
                type: "textarea",
                required: true,
              },
            ]}
            busy={busy}
            onSave={async (values) => {
              await save("records", { stage: "Perdu", lost_reason: values.lost_reason }, lost);
              setLost(null);
            }}
          />
        )}
        {detail && (
          <RecordDetails
            key={detail.id}
            record={detail}
            onClose={() => {
              setDismissedLink(linkedId);
              setDetail(null);
              if (linkedId)
                router.replace("/app/" + (object.standard ? object.slug : "object-" + object.slug));
            }}
            onEdit={() => {
              setDismissedLink(linkedId);
              setEdit(detail);
              setDetail(null);
            }}
          />
        )}
        {studioKind && (
          <ObjectStudio
            object={object}
            initialKind={studioKind}
            onClose={() => setStudioKind(null)}
          />
        )}
      </div>
    </RecordRelationsProvider>
  );
}
