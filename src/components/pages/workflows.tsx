"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, GitBranch, History, Pause, Play, Plus, Search, Zap } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useRows, useSave, useWorkspace, request } from "../data-provider";
import { PageHeader, Modal, Empty, ErrorMessage } from "../ui";
import { Pagination } from "../pagination";
import { RecordPicker } from "../record-picker";
import { WorkflowBuilder, type WorkflowDraft } from "../workflows/builder";
import { WorkflowHistory, State } from "../workflows/history";
import { workflowTemplates, templateDefinition, workflowTriggers } from "@/lib/domain/workflow-templates";
import type { Workflow, Simulation } from "@/lib/domain/types";
import styles from "../workflows/workflows.module.css";
export function WorkflowsPage() {
 const { workspace, objects, user }=useWorkspace();
 const [tab,setTab]=useState<"workflows"|"templates"|"history">("workflows");
 const [page,setPage]=useState(0),[search,setSearch]=useState(""),[filter,setFilter]=useState(""),[state,setState]=useState("");
 const q=useRows<Workflow>("workflows",{size:25,page,q:filter,state});
 const {save}=useSave(); const cache=useQueryClient();
 const [editing,setEditing]=useState<{row?:Workflow;initial?:WorkflowDraft}|null>(null);
 const [test,setTest]=useState<Workflow|null>(null),[record,setRecord]=useState("");
 const [preview,setPreview]=useState<(Simulation&{id:string})|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[historyFilter,setHistoryFilter]=useState("");
 const readonly=workspace.role==="viewer";
 const editable=(w:Workflow)=>!readonly && (!w.created_by || w.created_by===user.id || ["owner","admin"].includes(workspace.role));
 async function refresh(){await Promise.all([cache.invalidateQueries({queryKey:["rows",workspace.id]}),cache.invalidateQueries({queryKey:["workflow-history",workspace.id]})]);}
 async function control(row:Workflow,action:"publish"|"pause"|"resume"|"retry"|"cancel",execution?:string){
  await request(`/api/${workspace.id}/automation`,"POST",{id:row.id,version:row.version,action,...(execution?{execution}:{})});await refresh();
  toast.success(({publish:"Automatisation publiée.",pause:"Automatisation en pause.",resume:"Automatisation reprise.",retry:"Nouvelle tentative planifiée.",cancel:"Exécution arrêtée."})[action]);
 }
 async function quickControl(row:Workflow,action:"pause"|"resume"){
  setBusy(true);setError("");try{await control(row,action);}catch(err){setError(err instanceof Error?err.message:"Modification impossible.");}finally{setBusy(false);}
 }
 async function simulate(){setBusy(true);setError("");try{const r=await request<{data:Simulation&{id:string}}>(`/api/${workspace.id}/simulate`,"POST",{workflow_id:test!.id,...(record?{record_id:record}:{})});setTest(null);setPreview(r.data);}catch(err){setError(err instanceof Error?err.message:"Aperçu impossible.");}finally{setBusy(false);}}
 return <div className={styles.root}>
  <PageHeader title="Automatisations" description="Organisez le suivi commercial, du premier contact à la réalisation client." action={<div className={styles.topTools}><button className="button" disabled={readonly} onClick={()=>setTab("templates")}><GitBranch size={15}/>Modèles</button><button className="button primary" disabled={readonly} onClick={()=>setEditing({})}><Plus size={15}/>Créer un workflow</button></div>}/>
  {error&&<div className="alert error" role="alert">{error}</div>}
  <div className={styles.tabs} role="group" aria-label="Automatisations">{(["workflows","templates","history"] as const).map(key=><button key={key} aria-pressed={tab===key} disabled={key==="history"&&readonly} onClick={()=>setTab(key)}>{({workflows:"Mes workflows",templates:"Modèles",history:"Historique"})[key]}</button>)}</div>
  {tab==="workflows"&&<>
   <div className={styles.intro}><Zap size={28}/><div><h3>Le bon suivi, au bon moment.</h3><p>Déclenchez un processus à la création d’une fiche ou au changement d’étape. Ajoutez des conditions, des délais et des actions attribuées à votre équipe.</p></div><Link href="/docs/automatisations">Comprendre les workflows →</Link></div>
   <div className={styles.toolbar}><form className={styles.filters} onSubmit={e=>{e.preventDefault();setFilter(search);setPage(0);}}><input aria-label="Rechercher un workflow" maxLength={200} placeholder="Rechercher une automatisation…" value={search} onChange={e=>setSearch(e.target.value)}/><button className="button small" type="submit"><Search size={14}/>Rechercher</button><select aria-label="État des workflows" value={state} onChange={e=>{setState(e.target.value);setPage(0);}}><option value="">Tous les états</option><option value="active">Actifs</option><option value="draft">Brouillons</option><option value="paused">En pause</option></select></form><span className={styles.meta}>{q.data?.count??0} workflow(s)</span></div>
   <ErrorMessage error={q.error}/>{q.isPending?<p>Chargement des workflows…</p>:q.data?.data.length===0?<Empty title="Votre premier processus automatisé" description="Partez d’un modèle de prospection, de vente ou de lancement client." action={<button className="button primary" disabled={readonly} onClick={()=>setTab("templates")}>Choisir un modèle</button>}/>:<div className={styles.workflowList}>{q.data?.data.map(w=><article className={styles.workflowRow} key={w.id}><div className={styles.workflowIdentity}><span><GitBranch size={20}/></span><button className={styles.workflowTitle} disabled={!editable(w)} onClick={()=>setEditing({row:w})}><strong>{w.name}</strong><small>{w.description||workflowTriggers[w.definition.trigger?.type??"manual"]}</small></button></div><div className={styles.meta}>{objects.find(o=>o.id===w.definition.object_id)?.name}<br/>{w.definition.actions.length} bloc(s) · {w.definition.conditions.length} critère(s)</div><div><State value={w.published_version?w.enabled?"active":"paused":"draft"}/>{w.published_version&&w.version!==w.published_version?<small className={styles.draftNote}>Brouillon modifié · v{w.version}</small>:<small className={styles.meta}> · v{w.version}</small>}</div><div className={styles.rowActions}><button className="button small" disabled={readonly||busy} onClick={()=>{setRecord("");setError("");setTest(w);}}><Play size={13}/>Tester</button>{w.published_version&&<button className="icon-button" aria-label={w.enabled?"Mettre en pause":"Reprendre"} disabled={!editable(w)||busy} onClick={()=>quickControl(w,w.enabled?"pause":"resume")}>{w.enabled?<Pause size={15}/>:<Play size={15}/>}</button>}<button className="icon-button" aria-label="Dupliquer le workflow" disabled={readonly} onClick={()=>setEditing({initial:{name:w.name+" · Copie",description:w.description??"",definition:JSON.parse(JSON.stringify(w.definition))}})}><Copy size={15}/></button><button className="icon-button" aria-label="Voir les exécutions" disabled={readonly} onClick={()=>{setHistoryFilter(w.id);setTab("history");}}><History size={15}/></button></div></article>)}</div>}
   <Pagination page={page} size={25} total={q.data?.count??0} onChange={setPage} busy={q.isFetching}/>
  </>}
  {tab==="templates"&&<div className={styles.templateGrid}>{workflowTemplates.map(t=><article key={t.id} className={styles.template}><GitBranch size={24}/><small>{t.group}</small><h3>{t.name}</h3><p>{t.description}</p><button className="button" disabled={readonly} onClick={()=>{const obj=objects.find(o=>o.slug===t.object)??objects[0];if(obj)setEditing({initial:{name:t.name,description:t.description,definition:templateDefinition(t,obj.id)}});}}>Adapter ce modèle →</button></article>)}</div>}
  {tab==="history"&&!readonly&&<WorkflowHistory workflows={q.data?.data??[]} workflowId={historyFilter} onFilter={setHistoryFilter} onControl={control}/>}
  {readonly&&<p className={styles.help}>La création, le lancement et l’historique détaillé sont réservés aux membres de l’équipe disposant des droits nécessaires.</p>}
  {editing&&<WorkflowBuilder key={editing.row?.id??"new"} workflow={editing.row} initial={editing.initial} onClose={()=>setEditing(null)} onSave={async(draft,row)=>(await save("workflows",draft,row)) as Workflow} onPublish={row=>control(row,"publish")}/>}
  {test&&<Modal open className={styles.root} title="Tester les conséquences" description="Cet aperçu ne crée aucune tâche et ne modifie aucune fiche." onClose={()=>{if(!busy)setTest(null);}}><h3>{test.name}</h3><p>Choisissez une fiche pour vérifier un cas précis, ou laissez la sélection vide pour examiner les fiches correspondant aux critères.</p><div className={styles.testOptions}><RecordPicker key={test.id} name="workflow-test-record" objectId={test.definition.object_id} onChange={setRecord}/><p className="caption">100 fiches correspondantes maximum. Les branches et délais sont présentés à titre prévisionnel.</p></div>{error&&<div className="alert error">{error}</div>}<div className="dialog-footer"><button className="button" disabled={busy} onClick={()=>setTest(null)}>Annuler</button><button className="button primary" disabled={busy} onClick={simulate}>{busy?"Calcul de l’aperçu…":"Afficher l’aperçu"}</button></div></Modal>}
  {preview&&<Modal open wide className={styles.root} title="Aperçu avant lancement" description="Relisez les fiches et les actions avant de confirmer." onClose={()=>{if(!busy)setPreview(null);}}><p><strong>{preview.records.length} fiche(s)</strong> correspondent aux critères. Les actions seront prises en charge par le service d’automatisation.</p>{preview.warnings.map((w,i)=><p className={styles.help} key={i}>{w}</p>)}<div className={styles.previewList}>{preview.records.map(r=><article key={r.id}><strong>{r.display_name}</strong>{r.changes.map((c,i)=><p key={i}>{i+1}. {c.description}</p>)}</article>)}</div>{!preview.records.length&&<p className={styles.help}>Aucune fiche ne correspond. Ajustez les critères ou choisissez une autre fiche.</p>}{error&&<div className="alert error">{error}</div>}<div className="dialog-footer"><button className="button" disabled={busy} onClick={()=>setPreview(null)}>Fermer l’aperçu</button><button className="button primary" disabled={busy||!preview.records.length||preview.records.some(r=>r.changes.some(c=>c.type==="email"))} onClick={async()=>{setBusy(true);setError("");try{await request(`/api/${workspace.id}/simulate`,"PATCH",{preview_id:preview.id});setHistoryFilter(preview.workflow_id);setPreview(null);setTab("history");await refresh();toast.success("Lancement enregistré. Suivez les étapes dans l’historique.");}catch(err){setError(err instanceof Error?err.message:"Lancement impossible.");}finally{setBusy(false);}}}>{busy?"Lancement…":"Confirmer le lancement"}</button></div></Modal>}
 </div>;
}
