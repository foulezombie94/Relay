"use client";
import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronLeft, LoaderCircle, Plus, Sparkles, WandSparkles, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { request, useWorkspace } from "../providers/data-provider";
import type { SkillDetail, SkillSummary } from "@/lib/domain/agent-skills";
import type { CrmRecord } from "@/lib/domain/types";
import styles from "../assistant/assistant.module.css";

export type ChatSkillSelection = { id: string; version_id: string; inputs: Record<string, unknown> } | { builder: true; inputs: Record<string, unknown> };
export function ChatSkillPicker({ busy, selectedLabel, onSelect, onClear }: { busy: boolean; selectedLabel?: string; onSelect: (selection: ChatSkillSelection, label: string) => void; onClear: () => void }) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [skillId, setSkillId] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState("");
  const listing = useQuery({ queryKey: ["skills-picker", workspace.id], enabled: open, queryFn: () => request<{data:SkillSummary[]}>(`/api/${workspace.id}/skills`) });
  const details = useQuery({ queryKey: ["skill-picker-detail", workspace.id, skillId], enabled: !!skillId, queryFn: () => request<{data:SkillDetail}>(`/api/${workspace.id}/skills?id=${skillId}`) });
  const manifest = details.data?.data.versions.find((v)=>v.id===details.data?.data.skill.granted_version_id)?.manifest;
  const records = useQuery({ queryKey: ["skill-input-records", workspace.id], enabled: !!manifest?.inputs.some((field)=>field.kind==="record"||field.kind==="records"), queryFn: () => request<{data:Pick<CrmRecord,"id"|"display_name">[]}>(`/api/${workspace.id}/records?size=50`) });
  const available = useMemo(()=> (listing.data?.data??[]).filter((item)=>item.status==="published"&&item.enabled&&item.granted_version_id),[listing.data]);
  function choose(item: SkillSummary) { setSkillId(item.id); setValues({}); setMessage(""); }
  function apply() {
    const skill = details.data?.data.skill;
    if (!manifest || !skill?.granted_version_id) return;
    const next: Record<string, unknown> = {};
    for (const field of manifest.inputs) {
      const value = values[field.key] ?? field.default;
      const empty = value === undefined || value === "" || (Array.isArray(value) && value.length===0);
      if (field.required && empty) { setMessage(`Complétez « ${field.label} » pour utiliser cette méthode.`); return; }
      if (!empty) next[field.key] = value;
    }
    onSelect({ id: skill.id, version_id: skill.granted_version_id, inputs: next }, manifest.name);
    setOpen(false); setSkillId("");
  }
  return <div className={styles.chatSkillWrap}>
    {selectedLabel&&<span className={styles.chatSkillChip}><Sparkles size={12}/>{selectedLabel}<button type="button" disabled={busy} aria-label="Retirer la méthode" onClick={onClear}><X size={12}/></button></span>}
    <Popover.Root open={open} onOpenChange={(next)=>{setOpen(next);if(!next){setSkillId("");setMessage("");}}}>
      <Popover.Trigger className={styles.chatSkillTrigger} type="button" disabled={busy} title="Choisir une méthode" aria-label="Choisir une méthode pour l’assistant"><Sparkles size={15}/><span>Méthode</span></Popover.Trigger>
      <Popover.Portal><Popover.Content className={styles.skillPopover} align="start" sideOffset={8} collisionPadding={12}>
        {skillId&&<button className={styles.skillBack} onClick={()=>{setSkillId("");setMessage("")}}><ChevronLeft size={14}/> Toutes les méthodes</button>}
        {!skillId?<><strong>Choisir une méthode</strong><p>La méthode cadre cette demande sans modifier les autorisations du chat.</p>{listing.isPending?<p>Chargement…</p>:available.length?available.map((item)=><button className={styles.skillOption} key={item.id} onClick={()=>choose(item)}><Sparkles size={14}/><span><b>{item.name}</b><small>{item.description}</small></span><Check size={13}/></button>):<p>Aucune méthode publiée et autorisée n’est activée. Ajoutez-en une dans la bibliothèque.</p>}<button className={styles.skillOption} onClick={()=>{onSelect({builder:true,inputs:{}} ,"Créer une méthode");setOpen(false)}}><WandSparkles size={14}/><span><b>Créer une méthode</b><small>Concevoir un brouillon dans le chat, sans action CRM.</small></span></button><Link className={styles.skillLibraryLink} href={`/app/skills?workspace=${workspace.id}`}><Plus size={14}/> Ouvrir la bibliothèque de skills</Link></>:details.isPending?<p><LoaderCircle className={styles.spin} size={15}/> Chargement de la méthode…</p>:!manifest?<p>Version autorisée indisponible. Rechargez la bibliothèque.</p>:<><strong>{manifest.name}</strong><p>{manifest.description}</p>{manifest.inputs.map((field)=>{const value=values[field.key]??field.default??(field.kind==="boolean"?false:field.kind==="records"?[]:"");const change=(next:unknown)=>setValues((old)=>({...old,[field.key]:next}));return <label className={styles.skillField} key={field.key}>{field.label}{field.kind==="long_text"?<textarea value={typeof value==="string"?value:""} required={field.required} onChange={(e)=>change(e.target.value)}/>:field.kind==="record"?<select value={typeof value==="string"?value:""} required={field.required} onChange={(e)=>change(e.target.value)}><option value="">Choisir une fiche…</option>{(records.data?.data??[]).map((record)=><option key={record.id} value={record.id}>{record.display_name}</option>)}</select>:field.kind==="records"?<select multiple value={Array.isArray(value)?value as string[]:[]} onChange={(e)=>change(Array.from(e.target.selectedOptions,(option)=>option.value))}>{(records.data?.data??[]).map((record)=><option key={record.id} value={record.id}>{record.display_name}</option>)}</select>:field.kind==="choice"?<select value={typeof value==="string"?value:""} onChange={(e)=>change(e.target.value)}><option value="">Choisir…</option>{field.options.map((option)=><option key={option}>{option}</option>)}</select>:field.kind==="boolean"?<input type="checkbox" checked={Boolean(value)} onChange={(e)=>change(e.target.checked)}/>:<input type={field.kind==="date"?"date":field.kind==="number"?"number":"text"} value={typeof value==="string"||typeof value==="number"?value:""} required={field.required} onChange={(e)=>change(field.kind==="number"?(e.target.value===""?"":Number(e.target.value)):e.target.value)}/>}{field.kind==="records"&&<small>Maintenez Ctrl ou Cmd pour sélectionner plusieurs fiches.</small>}</label>})}{message&&<p role="alert">{message}</p>}<button className={styles.applySkill} onClick={apply}>Utiliser cette méthode</button></>}
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </div>;
}
