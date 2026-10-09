"use client";
import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowLeft,
  FileUp,
  ShieldCheck,
  Check,
  FileSpreadsheet,
  Download,
  Link2,
} from "lucide-react";
import { useRows, useWorkspace } from "../providers/data-provider";
import { Modal, ErrorMessage, Loading, str, date } from "../ui";
import { importFields, type ImportError } from "@/lib/domain/imports";
import {
  crmSources,
  importLabels,
  migrationFields,
  type CrmSource,
} from "@/lib/domain/crm-migration";
import {
  stages,
  type Attribute,
  type ObjectDefinition,
} from "@/lib/domain/types";
import { BackgroundJob } from "../jobs/background-job";
import styles from "./import.module.css";
type Inspection = {
  headers?: string[];
  mapping?: Record<string, string>;
  total?: number;
  sample?: string[][];
  selections: { id: string; name: string }[];
  selection: string | null;
  ignored: string[];
  stages?: string[];
  columnValues?: Record<string, string[]>;
};
type Preview = {
  total: number;
  valid: number;
  errors: ImportError[];
  preview: Record<string, unknown>[];
};
type Result = {
  inserted: number;
  skipped: number;
  errors: ImportError[];
  replayed: boolean;
  linked?: number;
  pending?: number;
};
const stepLabels = ["Origine", "Fichier", "Correspondance", "Confirmation"];
function errorDownload(errors: ImportError[]) {
  return (
    "data:text/csv;charset=utf-8," +
    encodeURIComponent(
      "ligne;erreur\r\n" +
        errors
          .map(
            (e) =>
              e.line +
              ';"' +
              e.message.replaceAll('"', '""').replace(/^[=+@-]/, "'") +
              '"',
          )
          .join("\r\n"),
    )
  );
}
export function ImportRecords({
  object,
  attributes,
  pipelineId,
  onClose,
}: {
  object: ObjectDefinition;
  attributes: Attribute[];
  pipelineId?: string;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const objects = useRows<ObjectDefinition>("objects", { size: 100 });
  const [objectId, setObjectId] = useState(object.id);
  const destination =
    objects.data?.data.find((o) => o.id === objectId) ?? object;
  const importedAttrs = useRows<Attribute>("attributes", {
    object_id: objectId,
    size: 100,
  });
  const availableAttrs =
    objectId === object.id ? attributes : (importedAttrs.data?.data ?? []);
  const pipelines = useRows("pipelines", { size: 100 });
  const [selectedPipeline, setSelectedPipeline] = useState(pipelineId ?? "");
  const jobs = useRows("import_jobs", { object_id: objectId, size: 20 });
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<CrmSource>("file");
  const profile = crmSources.find((c) => c.id === source)!;
  const [migrationKey, setMigrationKey] = useState("principal");
  const [file, setFile] = useState<File | null>(null);
  const [selection, setSelection] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [stageMap, setStageMap] = useState<Record<string, string>>({});
  const [numberFormat, setNumberFormat] = useState<"comma" | "dot">("dot");
  const [policy, setPolicy] = useState("skip");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const targets = [
    ...importFields.filter(
      (f) =>
        destination.slug === "deals" ||
        ![
          "stage",
          "amount",
          "currency",
          "close_date",
          "lost_reason",
          "probability",
        ].includes(f),
    ),
    ...migrationFields.filter(
      (f) => f !== "_person_ids" || destination.slug === "deals",
    ),
  ];
  function invalidatePreview() {
    setPreview(null);
    setAccepted(false);
    setConfirmed(false);
  }
  async function run(
    mode: "inspect" | "preview" | "commit",
    input = file,
    choice = selection,
    header = headerRow,
  ) {
    if (!input) return;
    if (mode === "inspect") {
      setInspection((current) =>
        current ? { ...current, headers: undefined } : null,
      );
      invalidatePreview();
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", input);
      form.set("object_id", objectId);
      form.set("mode", mode);
      form.set("source", source);
      form.set("migration_key", migrationKey);
      form.set("header_row", String(header));
      if (choice) form.set("selection", choice);
      form.set("number_format", numberFormat);
      form.set("duplicate_policy", policy);
      form.set("stage_map", JSON.stringify(stageMap));
      if (destination.slug === "deals" && selectedPipeline)
        form.set("pipeline_id", selectedPipeline);
      if (mode !== "inspect") form.set("mapping", JSON.stringify(mapping));
      form.set("accept_errors", String(accepted));
      const response = await fetch("/api/" + workspace.id + "/imports", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Import impossible. Réessayez.");
      if (mode === "inspect") {
        setInspection(data);
        setSelection(data.selection ?? choice);
        invalidatePreview();
        const next = Object.fromEntries(
          Object.entries(data.mapping ?? ({} as Record<string, string>)).map(
            ([h, v]) => [
              h,
              targets.includes(v as (typeof targets)[number]) ||
              availableAttrs.some((a) => "attr_" + a.key === v)
                ? v
                : "",
            ],
          ),
        );
        setMapping(next as Record<string, string>);
        const nextStages: Record<string, string> = {};
        for (const stage of data.stages ?? [])
          if (stages.includes(stage as (typeof stages)[number]))
            nextStages[stage] = stage;
        setStageMap(nextStages);
      } else if (mode === "preview") {
        setPreview(data);
        setAccepted(false);
        setConfirmed(false);
        setStep(3);
      } else {
        if (data.queued) setJobId(data.job.id);
        else setResult(data);
        await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
    } finally {
      setBusy(false);
    }
  }
  const stageHeader = Object.keys(mapping).find((h) => mapping[h] === "stage");
  const sourceStages = stageHeader
    ? (inspection?.columnValues?.[stageHeader] ?? inspection?.stages ?? [])
    : [];
  const running = Boolean(jobId && !result);
  return (
    <Modal
      open
      onClose={onClose}
      title={"Importer dans Relay"}
      className={styles.dialog}
      description="Reprenez vos données, vérifiez-les, puis confirmez leur import."
      wide
    >
      <div className={styles.root}>
        {!result && !running && (
          <ol className={styles.steps} aria-label="Étapes de l’import">
            {stepLabels.map((label, i) => (
              <li
                key={label}
                aria-current={step === i ? "step" : undefined}
                className={i < step ? styles.done : ""}
              >
                <span>{i < step ? <Check size={14} /> : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        )}
        <ErrorMessage error={error ? new Error(error) : null} />
        {running ? (
          <>
            <h3>Votre import est en cours</h3>
            <p>
              Le traitement continue si vous fermez cette fenêtre. Le résultat
              apparaîtra dans l’historique.
            </p>
            <BackgroundJob
              id={jobId!}
              onComplete={async (data) => {
                setResult(data as Result);
                await cache.invalidateQueries({
                  queryKey: ["rows", workspace.id],
                });
              }}
            />
            <button className="button" onClick={onClose}>
              Fermer
            </button>
          </>
        ) : result ? (
          <>
            <div className={styles.success}>
              <span>
                <Check size={25} />
              </span>
              <h3>
                {result.replayed
                  ? "Cet import a déjà été traité"
                  : "Vos fiches sont prêtes"}
              </h3>
              <p>
                {result.inserted} créées · {result.skipped} doublons ignorés ·{" "}
                {result.errors.length} lignes rejetées
              </p>
            </div>
            <p className={styles.notice}>
              <Link2 size={17} />
              {result.linked ?? 0} relations créées pendant cet import.{" "}
              {result.pending ?? 0} relations restent en attente dans ce lot ;
              importez les fiches cibles avec leurs ID pour les compléter.
            </p>
            {result.errors.length > 0 && (
              <a
                className="button"
                download="erreurs-import.csv"
                href={errorDownload(result.errors)}
              >
                <Download size={15} /> Télécharger les erreurs
              </a>
            )}
            <div className={styles.footer}>
              <button
                className="button"
                onClick={() => {
                  setResult(null);
                  setJobId(null);
                  invalidatePreview();
                  setStep(1);
                }}
              >
                Importer une autre table
              </button>
              <button className="button primary" onClick={onClose}>
                Terminer
              </button>
            </div>
          </>
        ) : (
          <>
            {step === 0 && (
              <>
                <h3>D’où viennent vos données ?</h3>
                <p>
                  Choisissez votre CRM pour retrouver les instructions d’export
                  adaptées.
                </p>
                <div className={styles.sources}>
                  {crmSources.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      aria-pressed={source === c.id}
                      onClick={() => setSource(c.id)}
                    >
                      <span>
                        {c.name}
                        {source === c.id && <Check size={16} />}
                      </span>
                      <small>{c.formats}</small>
                    </button>
                  ))}
                </div>
                <div className={styles.footer}>
                  <Link href="/doc?article=migrations" target="_blank">
                    Guide des migrations
                  </Link>
                  <button className="button primary" onClick={() => setStep(1)}>
                    Continuer <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <h3>Votre export {source === "file" ? "" : profile.name}</h3>
                <details className={styles.instructions} open>
                  <summary>Comment préparer votre export</summary>
                  <ol>
                    {profile.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  {profile.url && (
                    <a href={profile.url} target="_blank" rel="noreferrer">
                      Consulter la documentation {profile.name}{" "}
                      <ArrowRight size={13} />
                    </a>
                  )}
                </details>
                <div className={styles.options}>
                  <label>
                    Importer dans
                    <select
                      disabled={busy}
                      value={objectId}
                      onChange={(e) => {
                        setObjectId(e.target.value);
                        setInspection(null);
                        setMapping({});
                        invalidatePreview();
                        setSelection("");
                      }}
                    >
                      {(objects.data?.data ?? [object])
                        .filter(
                          (o) =>
                            ["people", "companies", "deals"].includes(o.slug) ||
                            o.id === object.id,
                        )
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Nom du lot de migration
                    <input
                      maxLength={80}
                      value={migrationKey}
                      disabled={busy}
                      onChange={(e) => {
                        setMigrationKey(e.target.value);
                        invalidatePreview();
                      }}
                    />
                    <small>
                      Gardez le même nom pour les fichiers du même compte{" "}
                      {profile.name}. Changez-le pour un autre compte.
                    </small>
                  </label>
                </div>
                <label className={styles.upload}>
                  <FileUp size={28} />
                  <strong>
                    {file ? file.name : "Choisissez votre fichier d’export"}
                  </strong>
                  <span>CSV, Excel .xlsx, JSON ou ZIP · 4 Mo maximum</span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.json,.zip"
                    disabled={busy}
                    onChange={(e) => {
                      const next = e.target.files?.[0] ?? null;
                      setFile(next);
                      setSelection("");
                      setInspection(null);
                      setMapping({});
                      invalidatePreview();
                      setHeaderRow(1);
                      if (next) void run("inspect", next, "", 1);
                    }}
                  />
                </label>
                {file && (
                  <div className={styles.options}>
                    {inspection && inspection.selections.length > 1 && (
                      <label>
                        Fichier, feuille ou collection
                        <select
                          value={selection}
                          disabled={busy}
                          onChange={(e) => {
                            setSelection(e.target.value);
                            void run("inspect", file, e.target.value);
                          }}
                        >
                          <option value="">Choisir une table…</option>
                          {inspection.selections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {/\.(xlsx|zip)$/i.test(file.name) && (
                      <label>
                        Ligne d’en-tête Excel
                        <input
                          type="number"
                          min={1}
                          max={25}
                          value={headerRow}
                          disabled={busy}
                          onChange={(e) => {
                            const row = Number(e.target.value);
                            setHeaderRow(row);
                            setInspection(null);
                            invalidatePreview();
                          }}
                        />
                        <button
                          className="button small"
                          disabled={busy}
                          onClick={() => void run("inspect")}
                        >
                          Relire le fichier
                        </button>
                      </label>
                    )}
                  </div>
                )}
                {file && !inspection?.headers && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void run("inspect")}
                  >
                    Analyser le fichier sélectionné
                  </button>
                )}
                {inspection?.headers && (
                  <p className={styles.notice}>
                    <FileSpreadsheet size={17} />
                    {inspection.total} lignes · {inspection.headers.length}{" "}
                    colonnes · {destination.name}
                  </p>
                )}
                {!!inspection?.ignored.length && (
                  <details className={styles.instructions}>
                    <summary>
                      {inspection.ignored.length} fichiers non importés
                    </summary>
                    <p>
                      Ces fichiers ne sont pas des tables CSV, Excel ou JSON.
                      Les pièces jointes, configurations et activités ne sont
                      pas restaurées par cet import.
                    </p>
                    <ul>
                      {inspection.ignored.slice(0, 20).map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className={styles.security}>
                  <ShieldCheck size={16} /> Aucune fiche n’est créée avant votre
                  confirmation. Un ZIP est lu sans extraction sur le disque.
                </p>
                <div className={styles.footer}>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => setStep(0)}
                  >
                    <ArrowLeft size={15} /> Retour
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy || !inspection?.headers || !migrationKey.trim()
                    }
                    onClick={() => setStep(2)}
                  >
                    Associer les colonnes <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
            {step === 2 && inspection?.headers && (
              <>
                <h3>Chaque colonne, au bon endroit</h3>
                <p>
                  Vérifiez les suggestions. Les colonnes ignorées ne seront pas
                  importées. Pour les relations, associez des ID de fiches,
                  jamais leur nom.
                </p>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Colonne source</th>
                        <th>Exemple</th>
                        <th>Champ dans Relay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspection.headers.map((h, i) => (
                        <tr key={h}>
                          <td>{h}</td>
                          <td className={styles.sample}>
                            {inspection.sample?.[0]?.[i]?.slice(0, 90) || "—"}
                          </td>
                          <td>
                            <select
                              aria-label={"Associer " + h}
                              disabled={busy}
                              value={mapping[h] || ""}
                              onChange={(e) => {
                                setMapping((m) => ({
                                  ...m,
                                  [h]: e.target.value,
                                }));
                                invalidatePreview();
                              }}
                            >
                              <option value="">Ignorer cette colonne</option>
                              {targets.map((f) => (
                                <option key={f} value={f}>
                                  {importLabels[f]}
                                </option>
                              ))}
                              {availableAttrs
                                .filter(
                                  (a) =>
                                    !a.archived &&
                                    !["formula", "user", "relation"].includes(
                                      a.type,
                                    ),
                                )
                                .map((a) => (
                                  <option key={a.id} value={"attr_" + a.key}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {destination.slug === "deals" && (
                  <>
                    <label>
                      Pipeline de destination
                      <select
                        disabled={busy}
                        value={selectedPipeline}
                        onChange={(e) => {
                          setSelectedPipeline(e.target.value);
                          invalidatePreview();
                        }}
                      >
                        <option value="">Premier pipeline de l’espace</option>
                        {pipelines.data?.data.map((p) => (
                          <option key={p.id} value={p.id}>
                            {str(p.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {sourceStages.length > 0 && (
                      <section className={styles.stageSection}>
                        <h4>Correspondance des étapes</h4>
                        <p>
                          Les étapes restent celles de votre pipeline Relay. Une
                          vente perdue sans motif reçoit la mention « raison non
                          renseignée dans l’export ».
                        </p>
                        {sourceStages.map((stage) => (
                          <label key={stage}>
                            {stage}
                            <select
                              disabled={busy}
                              value={stageMap[stage] || ""}
                              onChange={(e) => {
                                setStageMap((m) => ({
                                  ...m,
                                  [stage]: e.target.value,
                                }));
                                invalidatePreview();
                              }}
                            >
                              <option value="">Choisir une étape Relay…</option>
                              {stages.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </section>
                    )}
                  </>
                )}
                <div className={styles.options}>
                  <label>
                    Format des nombres
                    <select
                      disabled={busy}
                      value={numberFormat}
                      onChange={(e) => {
                        setNumberFormat(e.target.value as "comma" | "dot");
                        invalidatePreview();
                      }}
                    >
                      <option value="dot">International : 1,234.56</option>
                      <option value="comma">Français : 1 234,56</option>
                    </select>
                  </label>
                  <label>
                    Doublons par email / domaine
                    <select
                      disabled={busy}
                      value={policy}
                      onChange={(e) => {
                        setPolicy(e.target.value);
                        invalidatePreview();
                      }}
                    >
                      <option value="skip">
                        Ignorer les fiches existantes
                      </option>
                      <option value="create">Créer de nouvelles fiches</option>
                    </select>
                  </label>
                </div>
                <p className={styles.security}>
                  <ShieldCheck size={16} /> Les fiches existantes restent
                  inchangées. Un ID source déjà importé sera toujours ignoré,
                  même avec l’option « créer ».
                </p>
                <div className={styles.footer}>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft size={15} /> Retour
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy || !Object.values(mapping).includes("display_name")
                    }
                    onClick={() => void run("preview")}
                  >
                    Vérifier l’import <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
            {step === 3 && preview && (
              <>
                <h3>Vérifiez avant de confirmer</h3>
                <p>
                  {profile.name} → {destination.name} · Lot « {migrationKey} »
                </p>
                <div className={styles.review}>
                  <strong>
                    {preview.valid} ligne{preview.valid > 1 ? "s" : ""} valide
                    {preview.valid > 1 ? "s" : ""}
                  </strong>
                  <span>
                    {preview.errors.length} ligne
                    {preview.errors.length > 1 ? "s" : ""} à corriger
                  </span>
                  <span>
                    {policy === "skip"
                      ? "Doublons email / domaine ignorés"
                      : "Nouvelles fiches autorisées"}
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nom</th>
                        {destination.slug === "people" ? (
                          <th>Email</th>
                        ) : destination.slug === "deals" ? (
                          <>
                            <th>Étape</th>
                            <th>Montant / devise</th>
                          </>
                        ) : (
                          <th>Domaine</th>
                        )}
                        <th>ID source</th>
                        <th>Relations (ID source)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.map((r, i) => (
                        <tr key={i}>
                          <td>{str(r.display_name)}</td>
                          {destination.slug === "people" ? (
                            <td>{str(r.email)}</td>
                          ) : destination.slug === "deals" ? (
                            <>
                              <td>{str(r.stage)}</td>
                              <td>
                                {str(r.amount)} {str(r.currency)}
                              </td>
                            </>
                          ) : (
                            <td>{str(r.domain)}</td>
                          )}
                          <td>
                            {str(
                              (r._import as Record<string, unknown> | undefined)
                                ?.id,
                            )}
                          </td>
                          <td>
                            {[
                              (
                                r._import as
                                  | { companies?: string[]; people?: string[] }
                                  | undefined
                              )?.companies?.join(" ; "),
                              (
                                r._import as { people?: string[] } | undefined
                              )?.people?.join(" ; "),
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <small>
                  20 premières lignes valides. La confirmation revalide le
                  fichier et les droits d’accès. Les doublons exacts sont
                  comptés lors de l’enregistrement.
                </small>
                {preview.errors.length > 0 && (
                  <section className={styles.errors}>
                    <h4>Corrigez votre export, ou excluez ces lignes</h4>
                    <ul>
                      {preview.errors.slice(0, 10).map((e) => (
                        <li key={e.line}>
                          Ligne {e.line} : {e.message}
                        </li>
                      ))}
                    </ul>
                    <a
                      className="button small"
                      href={errorDownload(preview.errors)}
                      download="erreurs-import.csv"
                    >
                      <Download size={14} /> Toutes les erreurs
                    </a>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={accepted}
                        disabled={busy}
                        onChange={(e) => setAccepted(e.target.checked)}
                      />
                      Rejeter explicitement les {preview.errors.length} lignes
                      invalides
                    </label>
                  </section>
                )}
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  J’ai vérifié la destination, les champs et les étapes. Je
                  confirme l’import des lignes valides.
                </label>
                <div className={styles.footer}>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => setStep(2)}
                  >
                    <ArrowLeft size={15} /> Modifier la correspondance
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !preview.valid ||
                      !confirmed ||
                      (preview.errors.length > 0 && !accepted)
                    }
                    onClick={() => void run("commit")}
                  >
                    Importer {preview.valid} ligne{preview.valid > 1 ? "s" : ""}
                  </button>
                </div>
              </>
            )}
            {busy && (
              <div role="status">
                <Loading />
              </div>
            )}
          </>
        )}
        <details className={styles.history}>
          <summary>
            Historique des 20 derniers imports · {destination.name}
          </summary>
          <ErrorMessage error={jobs.error} />
          {jobs.data?.data.map((j) => (
            <div key={j.id}>
              <strong>{str(j.filename)}</strong>
              <small>
                {date(j.created_at)} · {str(j.inserted)} créées ·{" "}
                {str(j.skipped)} ignorées · {str(j.linked)} relations
              </small>
              {Array.isArray(j.errors) && j.errors.length > 0 && (
                <a
                  href={errorDownload(j.errors as ImportError[])}
                  download="erreurs-import.csv"
                >
                  Rapport d’erreurs
                </a>
              )}
            </div>
          ))}
          {jobs.data?.data.length === 0 && <p>Aucun import enregistré.</p>}
        </details>
      </div>
    </Modal>
  );
}
