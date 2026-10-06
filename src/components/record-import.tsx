"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRows, useWorkspace } from "./data-provider";
import { Modal, ErrorMessage, Loading, str, date } from "./ui";
import { importFields, type ImportError } from "@/lib/domain/imports";
import type { Attribute, ObjectDefinition } from "@/lib/domain/types";
import { BackgroundJob } from "./background-job";
type Inspection = {
  headers: string[];
  mapping: Record<string, string>;
  total: number;
  sample?: string[][];
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
};
const labels: Record<string, string> = {
  display_name: "Nom",
  email: "Email",
  domain: "Site internet",
  stage: "Étape",
  amount: "Montant",
  currency: "Devise",
  close_date: "Date de clôture",
  lost_reason: "Raison de perte",
  probability: "Probabilité (%)",
  attributes: "Attributs JSON",
};
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
  const jobs = useRows("import_jobs", { object_id: object.id, size: 20 });
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [numberFormat, setNumberFormat] = useState("comma");
  const [policy, setPolicy] = useState("skip");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [jobId,setJobId]=useState<string|null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const targets = importFields.filter(
    (f) =>
      object.slug === "deals" ||
      ![
        "stage",
        "amount",
        "currency",
        "close_date",
        "lost_reason",
        "probability",
      ].includes(f),
  );
  async function run(mode: "inspect" | "preview" | "commit", source = file) {
    if (!source) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", source);
      form.set("object_id", object.id);
      form.set("mode", mode);
      form.set("number_format", numberFormat);
      form.set("duplicate_policy", policy);
      if (pipelineId) form.set("pipeline_id", pipelineId);
      if (mode !== "inspect") form.set("mapping", JSON.stringify(mapping));
      form.set("accept_errors", String(accepted));
      const response = await fetch("/api/" + workspace.id + "/imports", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import impossible.");
      if (mode === "inspect") {
        setInspection(data);
        setMapping(
          Object.fromEntries(
            Object.entries(data.mapping as Record<string, string>).map(
              ([h, v]) => [
                h,
                targets.includes(v as (typeof targets)[number]) ||
                attributes.some((a) => "attr_" + a.key === v)
                  ? v
                  : "",
              ],
            ),
          ),
        );
        setPreview(null);
        setResult(null);
      } else if (mode === "preview") {
        setPreview(data);
        setAccepted(false);
      } else {
        if(data.queued) setJobId(data.job.id);
        else setResult(data);
        await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
    } finally {
      setBusy(false);
    }
  }
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
  return (
    <Modal open onClose={onClose} title={"Importer · " + object.name} wide>
      <p>
        CSV ou Excel .xlsx · 5 Mo · 1 000 lignes. Excel utilise la première
        feuille ; remplacez les formules par leurs valeurs.
      </p>
      <ErrorMessage error={error ? new Error(error) : null} />
      {jobId && !result ? <BackgroundJob id={jobId} onComplete={(data)=>setResult(data as Result)} /> : null}
      {jobId && !result ? <button className="button" onClick={onClose}>Fermer</button> : result ? (
        <div className="alert info">
          <strong>
            {result.replayed
              ? "Cet import était déjà enregistré."
              : "Import enregistré."}
          </strong>
          <p>
            {result.inserted} fiches créées · {result.skipped} doublons ignorés
            · {result.errors.length} lignes invalides.
          </p>
          {result.errors.length > 0 && (
            <a
              className="button small"
              download="erreurs-import.csv"
              href={errorDownload(result.errors)}
            >
              Télécharger les erreurs
            </a>
          )}
          <button className="button" onClick={onClose}>
            Terminer
          </button>
        </div>
      ) : (
        <>
          <label>
            Fichier
            <input
              type="file"
              accept=".csv,.xlsx"
              disabled={busy}
              onChange={(e) => {
                const next = e.target.files?.[0];
                setInspection(null);
                setPreview(null);
                setResult(null);
                setMapping({});
                if (next) {
                  setFile(next);
                  void run("inspect", next);
                } else setFile(null);
              }}
            />
          </label>
          {inspection && (
            <>
              <div className="toolbar">
                <span className="pill">{inspection.total} lignes</span>
                <label>
                  Format des nombres
                  <select
                    value={numberFormat}
                    disabled={busy}
                    onChange={(e) => {
                      setNumberFormat(e.target.value);
                      setPreview(null);
                    }}
                  >
                    <option value="comma">Français : 1 234,56</option>
                    <option value="dot">International : 1,234.56</option>
                  </select>
                </label>
                <label>
                  Doublons
                  <select
                    value={policy}
                    disabled={busy}
                    onChange={(e) => {
                      setPolicy(e.target.value);
                      setPreview(null);
                    }}
                  >
                    <option value="skip">
                      Ignorer les emails / domaines existants
                    </option>
                    <option value="create">Créer de nouvelles fiches</option>
                  </select>
                </label>
              </div>
              <p className="footer-note">
                Les personnes sont rapprochées par email et les entreprises par
                domaine. Les opportunités ne sont pas rapprochées par leur nom.
                Aucune fiche existante ne sera écrasée.
              </p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Colonne du fichier</th>
                      <th>Exemple</th>
                      <th>Champ Relay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspection.headers.map((header, i) => (
                      <tr key={header}>
                        <td>{header}</td>
                        <td>
                          {inspection.sample?.[0]?.[i]?.slice(0, 100) || "—"}
                        </td>
                        <td>
                          <select
                            aria-label={"Associer " + header}
                            value={mapping[header] || ""}
                            disabled={busy}
                            onChange={(e) => {
                              setMapping((current) => ({
                                ...current,
                                [header]: e.target.value,
                              }));
                              setPreview(null);
                            }}
                          >
                            <option value="">Ignorer cette colonne</option>
                            {targets.map((f) => (
                              <option value={f} key={f}>
                                {labels[f]}
                              </option>
                            ))}
                            {attributes
                              .filter(
                                (a) =>
                                  !a.archived &&
                                  !["formula", "user", "relation"].includes(
                                    a.type,
                                  ),
                              )
                              .map((a) => (
                                <option value={"attr_" + a.key} key={a.id}>
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
              <div className="dialog-footer">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => void run("preview")}
                >
                  Vérifier les lignes
                </button>
              </div>
              {preview && (
                <>
                  <h3>
                    {preview.valid} lignes valides · {preview.errors.length} à
                    corriger
                  </h3>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Nom</th>
                          <th>Email</th>
                          <th>Site</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview.map((row, i) => (
                          <tr key={i}>
                            <td>{str(row.display_name)}</td>
                            <td>{str(row.email)}</td>
                            <td>{str(row.domain)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <small>
                    Aperçu des 20 premières lignes valides. Toutes les lignes
                    seront revalidées à la confirmation.
                  </small>
                  {preview.errors.length > 0 && (
                    <>
                      <ul>
                        {preview.errors.slice(0, 20).map((e) => (
                          <li key={e.line}>
                            Ligne {e.line} : {e.message}
                          </li>
                        ))}
                      </ul>
                      <a
                        className="button small"
                        download="erreurs-import.csv"
                        href={errorDownload(preview.errors)}
                      >
                        Télécharger toutes les erreurs
                      </a>
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          checked={accepted}
                          onChange={(e) => setAccepted(e.target.checked)}
                        />
                        Importer uniquement les lignes valides et rejeter les{" "}
                        {preview.errors.length} lignes invalides
                      </label>
                    </>
                  )}
                  <div className="dialog-footer">
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        !preview.valid ||
                        (preview.errors.length > 0 && !accepted)
                      }
                      onClick={() => void run("commit")}
                    >
                      Importer {preview.valid} lignes valides
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {busy && <Loading />}
        </>
      )}
      <h3 className="section-title">Historique · 20 derniers imports</h3>
      <ErrorMessage error={jobs.error} />
      {jobs.data?.data.map((job) => (
        <div className="detail-card" key={job.id}>
          <strong>{str(job.filename)}</strong>
          <p>
            {date(job.created_at)} · {str(job.inserted)} créées ·{" "}
            {str(job.skipped)} doublons ignorés
          </p>
          {Array.isArray(job.errors) && job.errors.length > 0 && (
            <a
              className="button small"
              download="erreurs-import.csv"
              href={errorDownload(job.errors as ImportError[])}
            >
              Erreurs ({job.errors.length})
            </a>
          )}
        </div>
      ))}
      {jobs.data?.data.length === 0 && <p>Aucun import enregistré.</p>}
    </Modal>
  );
}
