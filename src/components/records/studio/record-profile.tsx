"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  FileText,
  ArrowUpRight,
  Plus,
  X,
  Link2,
  Sigma,
  MousePointer2,
  Pin,
  PanelRight,
  Trash2,
  Pencil,
  ListPlus,
  LayoutGrid,
  Activity,
  CheckSquare,
  Folder,
  Users,
  Layers3,
  MessageSquare,
  Globe,
  Mail,
  CalendarDays,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { recordHref, workspaceHref } from "@/lib/domain/workspace-navigation";
import { defaultLayout, type StudioConfig } from "@/lib/domain/record-studio";
import type { CrmRecord, Attribute, Simulation, ObjectDefinition } from "@/lib/domain/types";
import { request, useRows, useWorkspace, useSave } from "../../providers/data-provider";
import { Modal, Loading, ErrorMessage, money, str, date } from "../../ui";
import { RecordLists } from "../record-lists";
import { CompanyContactSidebar } from "../company-contact-sidebar";
import { CompanyLogo } from "../company-logo";
import { RecordPicker } from "../picker";
import { RecordRelationsField } from "../relations";
import { RecordContextPanel, useRecordContext } from "../context";
import { FieldHistory } from "../field-history";
import { RecordOverview, RelatedRecordList } from "../overview";
import { relatedRecords } from "@/lib/domain/record-profile";
import { ObjectStudio, StudioTrigger } from "./object-studio";
import { useStudio, useStudioActions, type StudioData } from "./use-studio";
import { studioFields, fieldValue, sectionNames, type StudioField } from "./fields";
import styles from "./studio.module.css";
import { RecordSkillLauncher } from "../../skills/record-launcher";

export function StudioRecordProfile({
  record,
  onClose,
  onEdit,
  renderSection,
}: {
  record: CrmRecord;
  onClose: () => void;
  onEdit: () => void;
  renderSection: (tab: string) => ReactNode;
}) {
  const { workspace, objects } = useWorkspace();
  const object = objects.find((o) => o.id === record.object_id)!;
  const [customizing, setCustomizing] = useState(false);
  const [tab, setTab] = useState("");
  const [listPicker, setListPicker] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [details, setDetails] = useState(true);
  const [error, setError] = useState("");
  const q = useStudio(record.object_id, record.id);
  const attrs = useRows<Attribute>("attributes", { object_id: record.object_id, size: 100 });
  const members = useRows("memberships", { size: 100 });
  const save = useSave();
  const readonly = workspace.role === "viewer" || !!record.merged_into || record.archived;
  const canManage = ["owner", "admin"].includes(workspace.role);
  const configs = q.data?.data ?? [];
  const layout = configs.find((c) => c.kind === "layout" && c.object_id === object.id);
  const spec =
    layout?.kind === "layout"
      ? layout.config
      : {
          ...defaultLayout,
          pinned: object.slug === "companies" ? [] : defaultLayout.pinned,
          groups: [
            {
              id: "properties",
              title: object.slug === "companies" ? "Détails de l’entreprise" : "Propriétés",
              fields: [
                "domain",
                "display_name",
                "email",
                "owner_id",
                ...(attrs.data?.data ?? []).filter((a) => !a.archived).map((a) => "attr_" + a.key),
              ],
            },
          ],
          sections: [
            ...defaultLayout.sections,
            ...(object.slug === "companies" ? ["contacts" as const, "deals" as const] : []),
          ],
        };
  // "changes" (field history) is always available, outside the configurable layout.
  const current =
    tab === "changes" || spec.sections.includes(tab as (typeof spec.sections)[number])
      ? tab
      : spec.sections[0];
  const context = useRecordContext(
    record.id,
    "summary",
    ["overview", "contacts", "deals"].includes(current),
  );
  const fields = studioFields(attrs.data?.data ?? []);
  const DetailsContainer = object.slug === "companies" ? "details" : "div";
  const owner = members.data?.data.find((m) => m.user_id === record.owner_id);
  function property(key: string) {
    const field = fields.find((f) => f.key === key);
    return field ? (
      <Property
        key={key}
        record={record}
        field={field}
        owner={str(owner?.display_name)}
        onEdit={onEdit}
        readonly={readonly}
      />
    ) : null;
  }
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={"CRM / " + object.name}
        description="Propriétés, relations et suivi de cette fiche."
        wide
        className={
          styles.recordModal + (object.slug === "companies" ? " " + styles.companyModal : "")
        }
      >
        <div className={styles.recordActions}>
          <Link className="button small" href={recordHref(record.workspace_id, object, record.id)}>
            <ArrowUpRight size={14} /> Lien vers cette fiche
          </Link>
          <span className={styles.grow} />
          {canManage && <StudioTrigger onClick={() => setCustomizing(true)} />}
          <button
            type="button"
            className="icon-button"
            aria-label="Afficher ou masquer les détails"
            aria-pressed={details}
            onClick={() => setDetails(!details)}
          >
            <PanelRight size={16} />
          </button>
          <button type="button" className="button small" disabled={readonly} onClick={onEdit}>
            <Pencil size={13} /> Modifier
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Mettre la fiche à la corbeille"
            disabled={readonly || save.busy}
            onClick={async () => {
              if (
                window.confirm(
                  "Mettre cette fiche à la corbeille ? Elle reste restaurable pendant 30 jours.",
                )
              )
                try {
                  await save.remove("records", record.id);
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Suppression impossible");
                }
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
        <header className={styles.recordHeader}>
          <span className={styles.pageIcon}>
            {object.slug === "companies" ? (
              <CompanyLogo name={record.display_name} domain={record.domain} size={52} />
            ) : (
              <FileText size={36} strokeWidth={1.3} />
            )}
          </span>
          <div className={styles.recordIdentity}>
            <span className={styles.recordEyebrow}>
              {object.name} <span> / </span> Fiche de suivi
            </span>
            <h1>{record.display_name}</h1>
            <div className={styles.recordMeta}>
              {record.domain && (
                <span>
                  <Globe size={13} />
                  {record.domain}
                </span>
              )}
              <span className={styles.stagePill}>
                {record.archived ? "Archivée" : record.stage}
              </span>
              {owner?.display_name ? (
                <span>
                  <Users size={13} />
                  {str(owner.display_name)}
                </span>
              ) : null}
            </div>
          </div>
          <button
            className={styles.headerEdit}
            type="button"
            onClick={onEdit}
            disabled={readonly}
            aria-label="Modifier le nom et les propriétés"
          >
            <Pencil size={15} />
          </button>
          <div className={styles.pinned}>
            {spec.pinned.map((key) => (
              <div key={key}>
                <Pin size={11} />
                {property(key)}
              </div>
            ))}
          </div>
          <WorkflowButtons configs={configs} record={record} readonly={readonly} />
          <Rollups data={q.data} />
          <div className={styles.quickActions}>
            <RecordSkillLauncher recordId={record.id} />
            <button
              className={styles.listAction}
              onClick={() => setListPicker(true)}
              disabled={readonly}
            >
              <ListPlus size={15} />
              Ajouter à une liste
            </button>
            <button
              className="icon-button"
              title="Notes"
              aria-label="Ouvrir les notes"
              onClick={() => setTab("notes")}
            >
              <FileText size={15} />
            </button>
            <button
              className="icon-button"
              title="Tâches"
              aria-label="Ouvrir les tâches"
              onClick={() => setTab("tasks")}
            >
              <CheckSquare size={15} />
            </button>
            <button
              className="icon-button"
              title="Relations"
              aria-label="Ouvrir les relations"
              onClick={() => setTab("relations")}
            >
              <Link2 size={15} />
            </button>
          </div>
        </header>
        <div className={styles.recordPage}>
          <ErrorMessage
            error={q.error || attrs.error || members.error || (error ? new Error(error) : null)}
          />
          <div
            className={styles.profileColumns}
            data-details={spec.details && details}
            data-company={object.slug === "companies"}
          >
            <aside className={styles.identityPanel}>
              {object.slug === "companies" && spec.details && details && (
                <CompanyContactSidebar
                  record={record}
                  attributes={attrs.data?.data ?? []}
                  visibleFields={spec.groups.flatMap((g) => g.fields)}
                  onDocuments={() => setTab("documents")}
                  onProperties={() => setPropertiesOpen(true)}
                  readonly={readonly}
                  onEdit={onEdit}
                />
              )}
              {spec.details && details && (
                <DetailsContainer
                  className={styles.detailsPanel}
                  {...(object.slug === "companies"
                    ? {
                        open: propertiesOpen,
                        onToggle: (e: React.SyntheticEvent<HTMLElement>) =>
                          setPropertiesOpen((e.currentTarget as HTMLDetailsElement).open),
                      }
                    : {})}
                >
                  {object.slug === "companies" && <summary>Toutes les propriétés</summary>}
                  {spec.groups.map((group) => (
                    <section key={group.id}>
                      <h3>{group.title}</h3>
                      {group.fields.map(property)}
                    </section>
                  ))}
                  <small>Créée le {date(record.created_at)}</small>
                </DetailsContainer>
              )}
              <RecordRelationsField record={record} slug={object.slug} />
              <TypedRelations data={q.data} record={record} objects={objects} readonly={readonly} />
              <RecordLists
                recordId={record.id}
                readonly={readonly}
                open={listPicker}
                onOpen={() => setListPicker(true)}
                onClose={() => setListPicker(false)}
              />
            </aside>
            <main className={styles.recordMain}>
              {(!spec.details || !details) && (
                <div className={styles.inlineProperties}>
                  {spec.groups.map((group) => (
                    <section key={group.id}>
                      <h3>{group.title}</h3>
                      {group.fields.map(property)}
                    </section>
                  ))}
                </div>
              )}
              <nav className={styles.recordTabs} aria-label="Sections de la fiche">
                {spec.sections.map((section) => (
                  <button
                    type="button"
                    key={section}
                    data-active={current === section}
                    aria-current={current === section ? "page" : undefined}
                    onClick={() => setTab(section)}
                  >
                    {(() => {
                      const icons = {
                        overview: LayoutGrid,
                        timeline: Activity,
                        activities: MessageSquare,
                        notes: FileText,
                        tasks: CheckSquare,
                        documents: Folder,
                        contacts: Users,
                        deals: Layers3,
                        relations: Link2,
                      };
                      const Icon = icons[section as keyof typeof icons] || CheckSquare;
                      return <Icon size={14} />;
                    })()}
                    {sectionNames[section]}
                    {context.data?.counts[section] ? (
                      <small>{context.data.counts[section]}</small>
                    ) : null}
                  </button>
                ))}
                <button
                  type="button"
                  data-active={current === "changes"}
                  aria-current={current === "changes" ? "page" : undefined}
                  onClick={() => setTab("changes")}
                >
                  <History size={14} />
                  Modifications
                </button>
              </nav>
              <section className={styles.sectionContent}>
                {current === "changes" ? (
                  <FieldHistory record={record} />
                ) : ["overview", "contacts", "deals"].includes(current) ? (
                  context.isPending ? (
                    <Loading />
                  ) : context.error ? (
                    <ErrorMessage error={context.error} />
                  ) : context.data ? (
                    current === "overview" ? (
                      <RecordOverview
                        record={record}
                        slug={object.slug}
                        context={context.data}
                        objects={objects}
                        attributes={[]}
                        owner={str(owner?.display_name)}
                        pipelines={[]}
                        onTab={setTab}
                        onEdit={onEdit}
                        readonly={readonly}
                        hideProperties
                      />
                    ) : (
                      <>
                        <h3>
                          {current === "contacts"
                            ? "Contacts de cette entreprise"
                            : "Opportunités de cette entreprise"}
                        </h3>
                        <RelatedRecordList
                          records={relatedRecords(
                            context.data.related,
                            objects,
                            current === "contacts" ? "people" : "deals",
                          )}
                          objects={objects}
                          onRelations={() => setTab("relations")}
                          empty="Aucune fiche liée pour le moment."
                        />
                      </>
                    )
                  ) : null
                ) : current === "timeline" || current === "relations" ? (
                  <RecordContextPanel key={record.id + current} record={record} mode={current} />
                ) : (
                  renderSection(current)
                )}
              </section>
            </main>
          </div>
        </div>
      </Modal>
      {customizing && <ObjectStudio object={object} onClose={() => setCustomizing(false)} />}
    </>
  );
}
function Property({
  record,
  field,
  owner,
  onEdit,
  readonly,
}: {
  record: CrmRecord;
  field: StudioField;
  owner: string;
  onEdit: () => void;
  readonly: boolean;
}) {
  const raw = fieldValue(record, field.key);
  const value =
    field.key === "owner_id"
      ? owner
      : field.key === "amount"
        ? money(record.amount, record.currency)
        : typeof raw === "boolean"
          ? raw
            ? "Oui"
            : "Non"
          : Array.isArray(raw)
            ? raw.join(", ")
            : raw == null
              ? ""
              : String(raw);
  const Icon =
    field.key === "domain"
      ? Globe
      : field.key === "email"
        ? Mail
        : field.key === "owner_id"
          ? Users
          : field.type === "date"
            ? CalendarDays
            : FileText;
  return (
    <div className={styles.property}>
      <span>
        <Icon size={13} />
        {field.label}
      </span>
      <button
        type="button"
        disabled={readonly}
        onClick={onEdit}
        data-empty={!value}
        title="Modifier cette propriété"
      >
        {value || "Vide"}
      </button>
    </div>
  );
}
function TypedRelations({
  data,
  record,
  objects,
  readonly,
}: {
  data?: StudioData;
  record: CrmRecord;
  objects: ObjectDefinition[];
  readonly: boolean;
}) {
  const actions = useStudioActions();
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const relations = (data?.data ?? []).filter(
    (c): c is Extract<StudioConfig, { kind: "relation" }> =>
      c.kind === "relation" && (c.object_id === record.object_id || c.config.inverse),
  );
  async function change(definition: string, target: string, unlink = false, inverse = false) {
    if (busy || !target) return;
    setBusy(true);
    setError("");
    try {
      await actions.link(definition, record.id, target, unlink, inverse);
      setAdding("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification impossible");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.relations}>
      {relations
        .flatMap((c) =>
          c.object_id === record.object_id &&
          c.config.target_object_id === record.object_id &&
          c.config.inverse
            ? [
                { c, inverse: false },
                { c, inverse: true },
              ]
            : [{ c, inverse: c.object_id !== record.object_id }],
        )
        .map(({ c, inverse }) => {
          const propertyId = c.id + (inverse ? ":inverse" : ":source");
          const target = inverse ? c.object_id : c.config.target_object_id;
          const links = (data?.links ?? []).filter(
            (l) =>
              l.definition_id === c.id &&
              (inverse ? l.target_id === record.id : l.source_id === record.id),
          );
          const linked = links
            .map((l) => ({
              link: l,
              row: data?.records?.find(
                (r) => r.id === (l.source_id === record.id ? l.target_id : l.source_id),
              ),
            }))
            .filter((item) => item.row);
          const multiple = inverse ? c.config.inverse_multiple : c.config.multiple;
          const object = objects.find((o) => o.id === target);
          return (
            <section key={propertyId} className={styles.relationProperty}>
              <div className={styles.relationLabel}>
                <Link2 size={14} />
                <span>{inverse ? c.config.inverse_name : c.name}</span>
              </div>
              <div className={styles.relationValues}>
                {linked.map(
                  ({ row }) =>
                    row && (
                      <span className={styles.relationChip} key={row.id}>
                        <Link
                          href={
                            object
                              ? recordHref(record.workspace_id, object, row.id)
                              : workspaceHref("/app/search", record.workspace_id)
                          }
                        >
                          <FileText size={13} />
                          {row.display_name}
                        </Link>
                        {!readonly && (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Retirer ${row.display_name}`}
                            disabled={busy}
                            onClick={() => void change(c.id, row.id, true, inverse)}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ),
                )}
                {!readonly && (multiple || !linked.length) && (
                  <button
                    type="button"
                    disabled={busy}
                    className={styles.addRelation}
                    onClick={() => setAdding(adding === propertyId ? "" : propertyId)}
                  >
                    <Plus size={13} />
                    {linked.length ? "Ajouter" : "Lier une fiche"}
                  </button>
                )}
                {adding === propertyId && (
                  <div className={styles.relationPicker}>
                    <small>
                      {object?.name} ·{" "}
                      {multiple ? "Plusieurs fiches autorisées" : "Une fiche maximum"}
                    </small>
                    <RecordPicker
                      name={"relation_" + propertyId}
                      objectId={target}
                      onChange={(id) => void change(c.id, id, false, inverse)}
                    />
                  </div>
                )}
              </div>
            </section>
          );
        })}
      {data?.partial && (
        <p className={styles.note}>
          Les 200 premiers liens sont affichés. Les calculs incluent toutes les fiches accessibles.
        </p>
      )}
      <ErrorMessage error={error ? new Error(error) : null} />
    </div>
  );
}
function Rollups({ data }: { data?: StudioData }) {
  if (!data?.rollups?.length) return null;
  return (
    <div className={styles.rollups}>
      {data.rollups.map((r) => (
        <div key={r.id}>
          <span>
            <Sigma size={13} />
            {r.name}
          </span>
          <strong>
            {r.count != null
              ? r.count
              : r.amounts
                ? r.amounts.length
                  ? r.amounts.map((amount) => money(amount.value, amount.currency)).join(" · ")
                  : "0"
                : r.date
                  ? date(r.date)
                  : "Aucune échéance"}
          </strong>
        </div>
      ))}
    </div>
  );
}
function WorkflowButtons({
  configs,
  record,
  readonly,
}: {
  configs: StudioConfig[];
  record: CrmRecord;
  readonly: boolean;
}) {
  const { workspace } = useWorkspace();
  const actions = useStudioActions();
  const [preview, setPreview] = useState<(Simulation & { id: string }) | null>(null);
  const [selected, setSelected] = useState<Extract<StudioConfig, { kind: "button" }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <div className={styles.actionButtons}>
        {configs
          .filter(
            (c): c is Extract<StudioConfig, { kind: "button" }> =>
              c.kind === "button" && c.object_id === record.object_id,
          )
          .map((c) => (
            <button
              key={c.id}
              type="button"
              className="button small"
              disabled={readonly || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                setSelected(c);
                try {
                  const result = await request<{ data: Simulation & { id: string } }>(
                    `/api/${workspace.id}/simulate`,
                    "POST",
                    { workflow_id: c.config.workflow_id, record_id: record.id },
                  );
                  setPreview(result.data);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Aperçu indisponible");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <MousePointer2 size={13} />
              {c.name}
            </button>
          ))}
      </div>
      <ErrorMessage error={error && !preview ? new Error(error) : null} />
      {preview && (
        <Modal
          open
          title={selected?.name ?? "Confirmer les actions"}
          description={selected?.config.confirmation}
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <div className={styles.actionPreview}>
            {preview.records.map((row) => (
              <section key={row.id}>
                <strong>{row.display_name}</strong>
                {row.changes.map((change, i) => (
                  <p key={i}>
                    {i + 1}. {change.description}
                  </p>
                ))}
              </section>
            ))}
            {preview.warnings.map((warning, i) => (
              <p key={i} className={styles.note}>
                {warning}
              </p>
            ))}
            {!preview.records.length && (
              <p>Aucune action ne correspond aux critères pour cette fiche.</p>
            )}
          </div>
          <ErrorMessage error={error ? new Error(error) : null} />
          <div className="dialog-footer">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || !preview.records.length}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  await request(`/api/${workspace.id}/simulate`, "PATCH", {
                    preview_id: preview.id,
                  });
                  await actions.refresh();
                  setPreview(null);
                  toast.success("Actions planifiées. Retrouvez leur suivi dans Automatisations.");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Lancement impossible");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Lancement…" : "Confirmer les actions"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
