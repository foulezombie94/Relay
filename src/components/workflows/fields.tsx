"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRows } from "../data-provider";
import { ErrorMessage } from "../ui";
import { DatePicker } from "../ui/date-picker";
import type { Attribute, Condition, Row, WorkflowAction } from "@/lib/domain/types";
import styles from "./workflows.module.css";

export const conditionFields = { stage: "Étape", amount: "Montant", probability: "Probabilité", email: "Email", domain: "Domaine", display_name: "Nom", close_date: "Clôture prévue", owner_id: "Responsable", pipeline_id: "Pipeline" };
const operators: Record<Condition["operator"], string> = { equals: "Est égal à", not_equals: "Est différent de", contains: "Contient", gt: "Est supérieur à", lt: "Est inférieur à", exists: "Est renseigné", not_exists: "N’est pas renseigné", before: "Est avant", after: "Est après" };
export function ConditionsEditor({ value, mode = "all", objectId, onChange, onMode }: { value: Condition[]; mode?: "all" | "any"; objectId: string; onChange: (value: Condition[]) => void; onMode: (mode: "all" | "any") => void }) {
  const attrs = useRows<Attribute>("attributes", { object_id: objectId, size: 100 });
  const fields = [...Object.entries(conditionFields), ...(attrs.data?.data.filter(a => !a.archived).map(a => ["attributes." + a.key, a.name]) ?? [])];
  return <div className={styles.conditionEditor}>
    <label>Correspondance<select value={mode} onChange={e => onMode(e.target.value as "all" | "any")}><option value="all">Toutes les conditions (ET)</option><option value="any">Au moins une condition (OU)</option></select></label>
    <ErrorMessage error={attrs.error} />
    {value.map((c, i) => <div key={i} className={styles.condition}>
      <label>Information<select value={c.field} onChange={e => onChange(value.map((v, n) => n === i ? { ...v, field: e.target.value } : v))}>{fields.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label>Comparaison<select value={c.operator} onChange={e => onChange(value.map((v, n) => n === i ? { ...v, operator: e.target.value as Condition["operator"] } : v))}>{Object.entries(operators).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {!["exists", "not_exists"].includes(c.operator) && <label>Valeur{["before", "after"].includes(c.operator) ? <DatePicker key={String(c.value)} name={"condition-date-" + i} label="Date de comparaison" defaultValue={String(c.value ?? "")} onValueChange={v => onChange(value.map((old, n) => n === i ? { ...old, value: v } : old))} /> : <input maxLength={300} value={String(c.value ?? "")} placeholder={c.field === "stage" ? "Qualification" : "Valeur à comparer"} onChange={e => onChange(value.map((v, n) => n === i ? { ...v, value: e.target.value } : v))} />}</label>}
      <button className="button small" type="button" onClick={() => onChange(value.filter((_, n) => n !== i))}><Trash2 size={13} />Retirer</button>
    </div>)}
    {!value.length && <p className="caption">Toutes les fiches de ce type remplissent les critères.</p>}
    <button className="button small" type="button" disabled={value.length >= 20} onClick={() => onChange([...value, { field: "stage", operator: "equals", value: "Qualification" }])}><Plus size={13} />Ajouter une condition</button>
  </div>;
}
export function ActionEditor({ action: a, objectId, onChange }: { action: WorkflowAction; objectId: string; onChange: (action: WorkflowAction) => void }) {
  const members = useRows<Row>("memberships", { size: 100 });
  const lists = useRows<Row>("lists", { object_id: objectId, size: 100 });
  const patch = (value: Partial<WorkflowAction>) => onChange({ ...a, ...value });
  return <div className={styles.actionEditor}>
    {["task", "commitment", "note"].includes(a.type) && <label>Titre<input required maxLength={300} value={a.title ?? ""} onChange={e => patch({ title: e.target.value })} /></label>}
    {["task", "commitment"].includes(a.type) && <><label>Échéance après l’action (jours)<input type="number" min={0} max={365} value={a.days ?? 1} onChange={e => patch({ days: Number(e.target.value) })} /></label><label>Responsable<select value={a.owner ?? "record"} onChange={e => patch({ owner: e.target.value as WorkflowAction["owner"] })}><option value="record">Responsable de la fiche</option><option value="runner">Personne qui lance ou publie</option><option value="selected">Un membre précis</option></select></label>{a.owner === "selected" && <label>Membre<select value={a.owner_id ?? ""} onChange={e => patch({ owner_id: e.target.value })}><option value="">Choisir…</option>{members.data?.data.filter(m => m.role !== "viewer").map(m => <option key={m.id} value={String(m.user_id)}>{String(m.display_name || "Membre")}</option>)}</select></label>}<ErrorMessage error={members.error} /><p className="caption">Si la fiche n’a pas de responsable, la personne qui lance ou publie est choisie.</p></>}
    {a.type === "commitment" && <p className={styles.help}>L’engagement sera proposé. Un membre doit confirmer le périmètre et la date avec le client.</p>}
    {a.type === "note" && <><label>Contenu<textarea required rows={6} maxLength={10000} value={a.body ?? ""} onChange={e => patch({ body: e.target.value })} /></label><p className="caption">Cette note sera partagée sur la fiche. Les notes privées existantes restent privées.</p></>}
    {a.type === "delay" && <><label>Attendre (minutes)<input type="number" min={1} max={43200} value={a.minutes ?? 1440} onChange={e => patch({ minutes: Number(e.target.value) })} /></label><div className={styles.presets}>{[[60, "1 heure"], [1440, "1 jour"], [2880, "2 jours"], [10080, "7 jours"]].map(([v, label]) => <button key={v} type="button" className="button small" onClick={() => patch({ minutes: Number(v) })}>{label}</button>)}</div><p className={styles.help}>Le workflow reprendra après ce délai, si les critères d’entrée sont toujours remplis. Aucun serveur ne reste occupé pendant l’attente.</p></>}
    {a.type === "set_field" && <><label>Information<select value={a.field ?? "stage"} onChange={e => patch({ field: e.target.value, value: e.target.value === "stage" ? "Qualification" : "" })}><option value="stage">Étape</option><option value="owner_id">Responsable</option><option value="close_date">Clôture prévue</option><option value="probability">Probabilité (%)</option></select></label><label>Nouvelle valeur{a.field === "owner_id" ? <select value={a.value ?? ""} onChange={e => patch({ value: e.target.value })}><option value="">Non attribué</option>{members.data?.data.filter(m => m.role !== "viewer").map(m => <option key={m.id} value={String(m.user_id)}>{String(m.display_name || "Membre")}</option>)}</select> : a.field === "close_date" ? <DatePicker key={a.value} name="workflow-close-date" label="Clôture prévue" defaultValue={a.value} onValueChange={value => patch({ value })} /> : <input maxLength={80} type={a.field === "probability" ? "number" : "text"} min={0} max={100} value={a.value ?? ""} onChange={e => patch({ value: e.target.value })} />}</label>{a.field === "stage" && <p className="caption">Utilisez le nom exact d’une étape du pipeline de la fiche.</p>}{a.field === "stage" && a.value === "Perdu" && <label>Raison de perte<textarea required maxLength={2000} value={a.lost_reason ?? ""} onChange={e => patch({ lost_reason: e.target.value })} /></label>}</>}
    {a.type === "add_to_list" && <><label>Liste de destination<select value={a.list_id ?? ""} onChange={e => patch({ list_id: e.target.value })}><option value="">Choisir une liste…</option>{lists.data?.data.map(l => <option key={l.id} value={l.id}>{String(l.name)}</option>)}</select></label><ErrorMessage error={lists.error} /><p className="caption">La liste doit accepter ce type de fiche. Une fiche déjà présente ne sera pas ajoutée deux fois.</p></>}
    {a.type === "branch" && <><ConditionsEditor value={a.conditions ?? []} mode={a.condition_mode} objectId={objectId} onChange={conditions => patch({ conditions })} onMode={condition_mode => patch({ condition_mode })} /><p className={styles.help}>Oui exécute la branche de gauche ; Non celle de droite. Les deux branches rejoignent ensuite la suite du workflow.</p></>}
    {a.type === "email" && <p className="alert error">Cette ancienne action doit être remplacée. Utilisez Séquences pour les emails programmés.</p>}
  </div>;
}
