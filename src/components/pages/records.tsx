"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RecordViews } from "../record-views";
import { defaultRecordView, type ViewConfig } from "@/lib/domain/views";
import { request, useRows, useSave, useWorkspace } from "../data-provider";
import {
  PageHeader,
  AddButton,
  Editor,
  Loading,
  ErrorMessage,
  Empty,
  Avatar,
  Badge,
  money,
  str,
  SearchBox,
  type Field,
} from "../ui";
import { RecordDetails } from "./record-details";
import { RecordBoard } from "../record-board";
import { RecordDirectory } from "../record-directory";
import { RecordTable } from "../record-table";
import { ImportRecords } from "../record-import";
import { type Pipeline } from "@/lib/domain/pipelines";
import type { CrmRecord, Attribute } from "@/lib/domain/types";
import { stages } from "@/lib/domain/types";
import { Building2, Users, Layers3 } from "lucide-react";
import styles from "./records.module.css";
export function RecordsPage({ slug }: { slug: string }) {
  const { objects, workspace } = useWorkspace();
  const object = objects.find((o) => o.slug === slug);
  const router = useRouter();
  const url = useSearchParams();
  const linkedId = url.get("record");
  const pipelineFromUrl = url.get("pipeline") ?? "";
  const pipelines = useRows<Pipeline>("pipelines", { size: 100 });
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ViewConfig>(() => defaultRecordView(slug));
  useEffect(() => {
    setView({
      ...defaultRecordView(slug),
      pipeline_id: slug === "deals" ? pipelineFromUrl : "",
    });
    setPage(1);
    setMode(
      slug === "deals" ? "kanban" : slug === "companies" ? "cards" : "table",
    );
  }, [slug, workspace.id, pipelineFromUrl]);
  const pageContent = {
    companies: {
      description:
        "Vos comptes clients et prospects, avec leur contexte et leurs coordonnées.",
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
      description:
        "Votre pipeline commercial, de la qualification à la signature.",
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
  const [mode, setMode] = useState(
    slug === "deals" ? "kanban" : slug === "companies" ? "cards" : "table",
  );
  function chooseMode(value: string) {
    const next = value === "kanban" && slug !== "deals" ? "cards" : value;
    setMode(next);
    setView((current) => ({
      ...current,
      layout: next as ViewConfig["layout"],
    }));
  }
  const [newStage, setNewStage] = useState("Nouveau");
  const [edit, setEdit] = useState<CrmRecord | true | null>(null);
  const [detail, setDetail] = useState<CrmRecord | null>(null);
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
            "/api/" +
              workspace.id +
              "/records?id=" +
              linkedId +
              "&archived=true",
          );
    },
  });
  useEffect(() => {
    const r = linked.data?.data[0];
    if (r && r.object_id === object?.id) {
      if (r.merged_into)
        router.replace(
          "/app/" +
            (object.standard ? object.slug : "object-" + object.slug) +
            "?record=" +
            r.merged_into,
        );
      else if (!r.archived) setDetail(r);
    }
  }, [linked.data, object, router]);
  const [importing, setImporting] = useState(false);
  const [lost, setLost] = useState<CrmRecord | null>(null);
  const [error, setError] = useState("");
  const q = useRows<CrmRecord>("records", {
    object_id: object?.id,
    pipeline_id: slug === "deals" ? view.pipeline_id || undefined : undefined,
    q: search || undefined,
    stage: view.stage || undefined,
    owner: view.owner || undefined,
    minimum: view.minimum || undefined,
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
                    : a.type === "multi_select"
                      ? "json"
                      : "text",
      options: (a.options ?? []).map((v) => ({ value: v, label: v })),
    });
  if (!object) return <Loading />;
  const rows = q.data?.data ?? [];
  const exportParams = new URLSearchParams({
    object_id: object.id,
    q: search,
    stage: view.stage,
    owner: view.owner,
    minimum: view.minimum,
    sort: view.sort,
    direction: view.direction,
    columns: view.columns.join(","),
    pipeline_id: slug === "deals" ? view.pipeline_id : "",
  });
  return (
    <>
      <div className={`${styles.pageHeading} ${styles[slug] ?? ""}`}>
        <span className={styles.pageIcon}>
          <PageIcon size={24} strokeWidth={1.6} />
        </span>
        <PageHeader
          title={object.name}
          description={pageContent.description}
          action={
            <AddButton
              label={pageContent.action}
              disabled={workspace.role === "viewer"}
              onClick={() => {
                setNewStage("Nouveau");
                setEdit(true);
              }}
            />
          }
        />
      </div>
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
        <div className="segmented">
          <button
            className={mode === "table" ? "active" : ""}
            onClick={() => chooseMode("table")}
          >
            Tableau
          </button>
          {slug === "deals" ? (
            <button
              className={mode === "kanban" ? "active" : ""}
              onClick={() => chooseMode("kanban")}
            >
              Pipeline
            </button>
          ) : (
            <button
              className={mode === "cards" ? "active" : ""}
              onClick={() => chooseMode("cards")}
            >
              Répertoire
            </button>
          )}
        </div>
        <a
          className="button small"
          href={"/api/" + workspace.id + "/exports?" + exportParams}
        >
          Exporter CSV
        </a>
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
          <a className="button small" href="/app/pipelines">
            Paramètres du pipeline
          </a>
        </div>
      )}
      <RecordViews
        key={object.id}
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
      {error && <div className="alert info">{error}</div>}
      <ErrorMessage
        error={q.error || linked.error || attrs.error || members.error}
      />
      {linkedId &&
        linked.data &&
        (!linked.data.data.length ||
          (linked.data.data[0]?.archived &&
            !linked.data.data[0]?.merged_into)) && (
          <div className="alert info">
            Cette fiche est archivée ou inaccessible.
          </div>
        )}
      {q.isPending ? (
        <Loading />
      ) : rows.length === 0 && mode !== "kanban" ? (
        <Empty
          title={`Aucune ${pageContent.single} pour le moment`}
          description={
            slug === "companies"
              ? "Ajoutez une entreprise pour centraliser le suivi de ce compte."
              : slug === "people"
                ? "Ajoutez un contact pour retrouver vos échanges et ses coordonnées."
                : "Ajoutez votre première opportunité pour suivre sa progression."
          }
          action={
            <AddButton
              label={pageContent.action}
              disabled={workspace.role === "viewer"}
              onClick={() => {
                setNewStage("Nouveau");
                setEdit(true);
              }}
            />
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
          onOpen={setDetail}
          onCreate={(stage) => {
            setNewStage(stage);
            setEdit(true);
          }}
          stageLabels={
            pipelines.data?.data.find((p) => p.id === view.pipeline_id)?.labels
          }
          onMove={async (record, stage) => {
            if (stage === "Perdu" && !record.lost_reason?.trim()) {
              setLost(record);
              return;
            }
            setError("");
            try {
              await save("records", { stage }, record);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Changement d’étape impossible.",
              );
              throw err;
            }
          }}
        />
      ) : (
        <RecordTable
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
          {mode === "kanban"
            ? " · Pipeline limité aux 50 résultats de cette page"
            : ""}
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
      {edit && (
        <Editor
          key={edit === true ? "new" : edit.id}
          open
          onClose={() => setEdit(null)}
          title={
            edit === true
              ? pageContent.action
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
                }
              : {
                  ...edit,
                  use_stage_probability: edit.probability == null,
                  ...Object.fromEntries(
                    custom.map((a) => [
                      "attr_" + a.key,
                      edit.attributes?.[a.key],
                    ]),
                  ),
                }
          }
          busy={
            busy ||
            attrs.isPending ||
            members.isPending ||
            !!attrs.error ||
            !!members.error
          }
          onSave={async (values) => {
            if (slug === "deals") {
              values.probability = values.use_stage_probability
                ? null
                : values.probability;
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
            slug === "deals"
              ? view.pipeline_id || pipelines.data?.data[0]?.id
              : undefined
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
            await save(
              "records",
              { stage: "Perdu", lost_reason: values.lost_reason },
              lost,
            );
            setLost(null);
          }}
        />
      )}
      {detail && (
        <RecordDetails
          key={detail.id}
          record={detail}
          onClose={() => {
            setDetail(null);
            if (linkedId)
              router.replace(
                "/app/" +
                  (object.standard ? object.slug : "object-" + object.slug),
              );
          }}
          onEdit={() => {
            setEdit(detail);
            setDetail(null);
          }}
        />
      )}
    </>
  );
}
