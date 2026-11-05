"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Eye, FileText, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { request } from "../providers/data-provider";
import { validateSkillValues, type SkillManifest } from "@/lib/domain/agent-skills";
import {
  missingSkillInputs,
  previewSkillText,
  skillVariableNames,
  type SkillPreview,
} from "@/lib/domain/skill-context";
import type { AssistantApprovalMode } from "@/lib/domain/assistant-approval";
import { toolEffects } from "@/lib/agent/contracts";
import { skillToolLabels } from "./tool-labels";
import { SkillBlocksPreview } from "./block-editor";
import styles from "./skills.module.css";
type Props = {
  workspace: string;
  id: string;
  versionId?: string;
  manifest: SkillManifest;
  draft?: boolean;
  record?: { id: string; label: string } | null;
  mode: AssistantApprovalMode;
  demo?: boolean;
  initialInputs?: Record<string, unknown>;
  onReady?: (values: Record<string, unknown>, record: { id: string; label: string } | null) => void;
};
export function SkillPreparation({
  workspace,
  id,
  versionId,
  manifest,
  draft = false,
  record = null,
  mode,
  demo = false,
  initialInputs = {},
  onReady,
}: Props) {
  const [scope, setScope] = useState(record),
    [search, setSearch] = useState(""),
    [recordTerm, setRecordTerm] = useState(""),
    [values, setValues] = useState<Record<string, unknown>>(initialInputs);
  // A different record resets the scope, adjusted during render.
  const [scopedRecord, setScopedRecord] = useState(record?.id);
  if (record?.id !== scopedRecord) {
    setScopedRecord(record?.id);
    setScope(record);
  }
  const filtered = Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) =>
        value !== "" &&
        value !== undefined &&
        value !== null &&
        (!Array.isArray(value) || value.length),
    ),
  );
  const raw = JSON.stringify({
    id,
    ...(draft ? { manifest } : { version_id: versionId }),
    ...(scope ? { record_id: scope.id } : {}),
    inputs: filtered,
    approval_mode: mode,
  });
  const [payload, setPayload] = useState(raw);
  useEffect(() => {
    const timer = setTimeout(() => setPayload(raw), 350);
    return () => clearTimeout(timer);
  }, [raw]);
  useEffect(() => {
    const timer = setTimeout(() => setRecordTerm(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const records = useQuery({
    queryKey: ["skill-preparation-records", workspace, recordTerm],
    enabled: !demo,
    queryFn: () =>
      request<{ data: { id: string; display_name: string }[] }>(
        `/api/${workspace}/records?size=30&q=${encodeURIComponent(recordTerm)}`,
      ),
  });
  const preview = useQuery({
    queryKey: ["skill-preparation", workspace, payload],
    enabled: !demo,
    queryFn: () =>
      request<{ data: SkillPreview }>(
        `/api/${workspace}/skills/preview`,
        "POST",
        JSON.parse(payload),
      ),
    retry: false,
    gcTime: 0,
  });
  const examples = [
    { id: "00000000-0000-4000-8000-000000000101", display_name: "Exemple · Studio Rivage" },
    { id: "00000000-0000-4000-8000-000000000102", display_name: "Exemple · Camille Martin" },
  ];
  const choices = demo ? examples : (records.data?.data ?? []);
  let data = preview.data?.data;
  if (demo) {
    let inputs: SkillPreview["inputs"] = {};
    let demoIssue = "";
    try {
      inputs = validateSkillValues(
        manifest,
        {
          ...filtered,
          ...(scope &&
          !Object.hasOwn(filtered, "record_id") &&
          manifest.inputs.some((field) => field.key === "record_id")
            ? { record_id: scope.id }
            : {}),
        },
        true,
      );
    } catch (reason) {
      demoIssue = reason instanceof Error ? reason.message : "Valeurs invalides";
    }
    const bindings: Record<string, string> = {
      aujourdhui: "2026-10-28",
      ...(scope
        ? {
            "fiche.nom": scope.label,
            "entreprise.nom": scope.label,
            "fiche.etape": "Qualification",
          }
        : {}),
    };
    for (const [key, value] of Object.entries(inputs)) bindings[`input.${key}`] = String(value);
    const missing = [
      ...missingSkillInputs(manifest, inputs),
      ...skillVariableNames(manifest.instructions)
        .filter((key) => !Object.hasOwn(bindings, key))
        .map((key) => `{{${key}}}`),
    ];
    data = {
      name: manifest.name,
      draft: true,
      ready: !missing.length && !demoIssue,
      record: scope,
      inputs,
      bindings,
      missing,
      issues: demoIssue ? [demoIssue] : [],
      instructions: previewSkillText(manifest.instructions, bindings),
      steps: manifest.steps,
      resources: manifest.resources,
      tools: manifest.tools.map((name) => ({ name, effect: toolEffects[name], available: true })),
      mode,
    };
  }
  const stale = raw !== payload;
  const ready = !!data?.ready && !stale && !preview.isFetching;
  const change = (key: string, value: unknown) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  return (
    <div className={styles.preparation}>
      <p className={styles.preparationNotice}>
        <Eye size={16} />
        Aperçu sans exécution : aucune action ni aucun appel à l’IA n’est lancé.
        {demo && " Données fictives."}
      </p>
      <label className={styles.preparationField}>
        Fiche de contexte
        <span className={styles.preparationSearch}>
          <Search size={14} />
          <input
            placeholder="Rechercher une fiche…"
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </span>
        <select
          aria-label="Fiche de contexte"
          value={scope?.id ?? ""}
          onChange={(event) => {
            const next = choices.find((item) => item.id === event.target.value);
            setScope(next ? { id: next.id, label: next.display_name } : null);
          }}
        >
          <option value="">Aucune fiche sélectionnée</option>
          {scope && !choices.some((item) => item.id === scope.id) && (
            <option value={scope.id}>{scope.label}</option>
          )}
          {choices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.display_name}
            </option>
          ))}
        </select>
      </label>
      {manifest.inputs.map((field) => {
        const value = Object.hasOwn(values, field.key)
          ? values[field.key]
          : (data?.inputs[field.key] ??
            field.default ??
            (field.kind === "records" ? [] : field.kind === "boolean" ? false : ""));
        return (
          <label className={styles.preparationField} key={field.key}>
            {field.label}
            {field.required && " *"}
            {!Object.hasOwn(values, field.key) && data?.inputs[field.key] !== undefined && (
              <small>Rempli depuis le contexte ou la valeur par défaut</small>
            )}
            {field.kind === "boolean" ? (
              <input
                type="checkbox"
                checked={!!value}
                onChange={(event) => change(field.key, event.target.checked)}
              />
            ) : field.kind === "long_text" ? (
              <textarea
                rows={2}
                maxLength={4000}
                value={String(value)}
                onChange={(event) => change(field.key, event.target.value)}
              />
            ) : field.kind === "record" || field.kind === "records" ? (
              <select
                aria-label={field.label}
                multiple={field.kind === "records"}
                value={
                  field.kind === "records"
                    ? Array.isArray(value)
                      ? (value as string[])
                      : []
                    : String(value)
                }
                onChange={(event) =>
                  change(
                    field.key,
                    field.kind === "records"
                      ? Array.from(event.target.selectedOptions, (option) => option.value)
                      : event.target.value,
                  )
                }
              >
                {field.kind === "record" && <option value="">Choisir une fiche…</option>}
                {!Array.isArray(value) &&
                  typeof value === "string" &&
                  value &&
                  !choices.some((item) => item.id === value) && (
                    <option value={value}>
                      {value === scope?.id ? scope.label : "Fiche sélectionnée"}
                    </option>
                  )}
                {choices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.display_name}
                  </option>
                ))}
              </select>
            ) : field.kind === "choice" ? (
              <select
                value={String(value)}
                onChange={(event) => change(field.key, event.target.value)}
              >
                <option value="">Choisir…</option>
                {field.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
                maxLength={4000}
                value={typeof value === "string" || typeof value === "number" ? value : ""}
                onChange={(event) =>
                  change(
                    field.key,
                    field.kind === "number" && event.target.value !== ""
                      ? Number(event.target.value)
                      : event.target.value,
                  )
                }
              />
            )}
          </label>
        );
      })}
      {!demo && (preview.isPending || preview.isFetching || stale) && (
        <p role="status">Préparation de l’aperçu…</p>
      )}
      {preview.error && !demo && (
        <p className={styles.preparationError} role="alert">
          {preview.error.message}
        </p>
      )}
      {data && !stale && (
        <>
          <div className={styles.preparationStatus} data-ready={data.ready}>
            {data.ready ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}
            <strong>
              {data.ready
                ? draft || demo
                  ? "Configuration prête à être publiée"
                  : "Prêt à utiliser dans le chat"
                : "Informations à compléter"}
            </strong>
          </div>
          {!!data.missing.length && (
            <ul>
              {data.missing.map((item) => (
                <li key={item}>À préciser : {item}</li>
              ))}
            </ul>
          )}
          {data.issues.map((issue) => (
            <p key={issue} role="alert">
              {issue}
            </p>
          ))}
          <details open className={styles.preparationSection}>
            <summary>Données utilisées</summary>
            {data.record ? <p>Fiche : {data.record.label}</p> : <p>Aucune fiche de contexte.</p>}
            {Object.entries(data.bindings).map(([key, value]) => (
              <div className={styles.bindingRow} key={key}>
                <code>{`{{${key}}}`}</code>
                <span>{value}</span>
              </div>
            ))}
          </details>
          <details className={styles.preparationSection}>
            <summary>Instructions avec ce contexte</summary>
            <SkillBlocksPreview value={data.instructions} />
          </details>
          <details className={styles.preparationSection}>
            <summary>Étapes et actions possibles</summary>
            <ol>
              {data.steps.map((step) => (
                <li key={step.id}>
                  <strong>{step.title}</strong>
                  <p>{step.instruction}</p>
                </li>
              ))}
            </ol>
            {data.tools.length ? (
              data.tools.map((tool) => (
                <div className={styles.bindingRow} key={tool.name}>
                  <span>
                    {skillToolLabels[tool.name as keyof typeof skillToolLabels] ?? tool.name}
                  </span>
                  <small>
                    {!tool.available
                      ? "Indisponible"
                      : tool.effect === "read"
                        ? "Lecture"
                        : tool.effect === "write"
                          ? "Modification interne"
                          : "Action externe"}
                  </small>
                </div>
              ))
            ) : (
              <p>Rédaction uniquement, sans outil CRM.</p>
            )}
            <p>
              <ShieldCheck size={14} /> Le mode du chat et vos permissions restent prioritaires. Les
              actions exactes seront déterminées pendant l’exécution.
            </p>
          </details>
          <details className={styles.preparationSection}>
            <summary>Ressources référencées ({data.resources.length})</summary>
            {data.resources.map((resource) => (
              <p key={`${resource.type}-${resource.id}`}>
                <FileText size={14} /> {resource.label || "Ressource"}
              </p>
            ))}
            {!data.resources.length && <p>Aucune ressource attachée.</p>}
          </details>
        </>
      )}
      {onReady && (
        <button
          type="button"
          className={styles.prepareApply}
          disabled={!ready}
          onClick={() => {
            if (data && ready) onReady(data.inputs, data.record);
          }}
        >
          Utiliser cette méthode dans le chat
        </button>
      )}
    </div>
  );
}
