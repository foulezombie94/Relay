"use client";
import { useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Braces, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "./ui";
import { exportFormats, recordExportFields, type ExportFormat } from "@/lib/domain/exports";
import type { Attribute } from "@/lib/domain/types";
import styles from "./record-export.module.css";

export function ExportRecords({ workspaceId, objectName, slug, params, columns, attributes, count }: {
  workspaceId: string; objectName: string; slug: string; params: URLSearchParams;
  columns: string[]; attributes: Attribute[]; count: number;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [scope, setScope] = useState("view");
  const [columnMode, setColumnMode] = useState("view");
  const [selected, setSelected] = useState<string[]>(columns);
  const [delimiter, setDelimiter] = useState(";");
  const [headers, setHeaders] = useState("labels");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const fields = recordExportFields(slug, attributes);
  const available = new Set(fields.map(field => field.key));
  const chosen = columnMode === "all" ? fields.map(field => field.key) : (columnMode === "view" ? columns : selected).filter(key => available.has(key));
  const finalKeys = new Set(["id", ...chosen, ...(chosen.includes("amount") ? ["currency"] : [])]);
  const isFiltered = ["q", "stage", "owner", "minimum", "pipeline_id"].some(key => !!params.get(key));
  function close() { controller.current?.abort(); setOpen(false); }
  async function download() {
    setBusy(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    try {
      const query = new URLSearchParams(params);
      query.set("format", format); query.set("scope", scope);
      query.set("column_mode", columnMode === "all" ? "all" : "selected");
      query.set("columns", [...finalKeys].join(","));
      query.set("headers", headers); query.set("delimiter", delimiter);
      const response = await fetch("/api/" + workspaceId + "/exports?" + query, { signal: abort.signal, cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Le téléchargement a échoué. Réessayez.");
      }
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "relay-export." + format;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success("Export téléchargé."); setOpen(false);
    } catch (err) {
      if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Impossible de préparer cet export.");
    } finally { setBusy(false); controller.current = null; }
  }
  return <>
    <button className="button small" onClick={() => { setSelected(columns); setError(""); setOpen(true); }}><Download size={15} />Exporter</button>
    {open && <Modal open onClose={close} title={"Exporter · " + objectName} description="Choisissez le fichier et les informations à emporter." className={styles.dialog}>
      <div className={styles.body}>
        <fieldset className={styles.section} disabled={busy}><legend>Format du fichier</legend>
          <div className={styles.formats}>{exportFormats.map(item => {
            const Icon = item.value === "xlsx" ? FileSpreadsheet : item.value === "json" ? Braces : FileText;
            return <label key={item.value} className={styles.format} data-selected={format === item.value}>
              <input type="radio" name="export-format" value={item.value} checked={format === item.value} onChange={() => { setFormat(item.value); setHeaders(item.value === "xlsx" ? "labels" : "keys"); }} />
              <Icon size={21} /><span><strong>{item.label}<small>.{item.extension}</small></strong><span>{item.description}</span></span>
            </label>;
          })}</div>
        </fieldset>
        <fieldset className={styles.section} disabled={busy}><legend>Fiches à exporter</legend>
          <label className={styles.option}><input type="radio" name="export-scope" checked={scope === "view"} onChange={() => setScope("view")} /><span><strong>Vue actuelle · {count.toLocaleString("fr-FR")} fiches</strong><span>{isFiltered ? "Vos filtres et votre recherche sont conservés." : "Toutes les fiches de cette vue."} Toutes les pages sont incluses.</span></span></label>
          <label className={styles.option}><input type="radio" name="export-scope" checked={scope === "all"} onChange={() => setScope("all")} /><span><strong>Toutes les fiches actives</strong><span>Exporter cet objet en retirant les filtres de la vue.</span></span></label>
        </fieldset>
        <fieldset className={styles.section} disabled={busy}><legend>Colonnes à inclure</legend>
          <select aria-label="Colonnes à inclure" value={columnMode} onChange={e => setColumnMode(e.target.value)}>
            <option value="view">Colonnes de la vue actuelle</option><option value="all">Toutes les propriétés disponibles</option><option value="custom">Choisir les colonnes</option>
          </select>
          {columnMode === "custom" && <div className={styles.columns}>{fields.map(field => <label key={field.key}><input type="checkbox" checked={finalKeys.has(field.key)} disabled={field.key === "id" || (field.key === "currency" && chosen.includes("amount"))} onChange={e => setSelected(current => e.target.checked ? [...current, field.key] : current.filter(key => key !== field.key))} />{field.label}</label>)}</div>}
          <p className={styles.hint}>{finalKeys.size} colonnes. L’identifiant Relay est toujours inclus ; la devise accompagne le montant.</p>
        </fieldset>
        {format !== "json" && <fieldset className={styles.section} disabled={busy}><legend>Options du fichier</legend><div className={styles.options}>
          <label>En-têtes des colonnes<select value={headers} onChange={e => setHeaders(e.target.value)}><option value="labels">Libellés lisibles avec identifiants</option><option value="keys">Identifiants des champs · réimport</option></select></label>
          {format === "csv" && <label>Séparateur CSV<select value={delimiter} onChange={e => setDelimiter(e.target.value)}><option value=";">Point-virgule · Excel français</option><option value=",">Virgule · CRM et outils internationaux</option></select></label>}
        </div></fieldset>}
        <div className={styles.summary}><Download size={19} /><div><strong>{exportFormats.find(item => item.value === format)?.label} · {finalKeys.size} colonnes</strong><p>{scope === "view" ? "Vue actuelle, toutes les pages" : "Toutes les fiches actives"}. Jusqu’à 10 000 fiches et 4 Mo par fichier. Au-delà, affinez vos filtres.</p></div></div>
        <p className={styles.hint}>Les notes, messages, pièces jointes et relations entre fiches ne font pas partie de cet export. Une probabilité vide signifie que l’opportunité utilise celle de son étape.</p>
        {error && <div className="alert error" role="alert">{error}</div>}
      </div>
      <div className={styles.footer}><button className="button" onClick={close}>Annuler</button><button className="button primary" onClick={download} disabled={busy || (scope === "view" && count > 10000)}>{busy ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}{busy ? "Préparation…" : "Télécharger l’export"}</button></div>
    </Modal>}
  </>;
}