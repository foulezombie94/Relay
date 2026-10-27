"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Check, Clock3, Eye, Heart, Plus, Search, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { request, useWorkspace } from "../providers/data-provider";
import { skillTemplate, skillTemplateDefinitions } from "@/lib/domain/skill-templates";
import { exportSkill, importSkill, parseSkillManifest, type SkillManifest, type SkillSummary, type SkillDetail } from "@/lib/domain/agent-skills";
import { toolEffects, type ToolName } from "@/lib/agent/contracts";
import styles from "./skills.module.css";

type Listing = { data: SkillSummary[]; next: string | null };
const endpoint = (workspace: string) => `/api/${workspace}/skills`;
const labelEffect = (tool: ToolName) => toolEffects[tool] === "read" ? "Lecture" : toolEffects[tool] === "external" ? "Externe" : "Écriture";
function inputWithKind(inputs: SkillManifest["inputs"], index: number, kind: SkillManifest["inputs"][number]["kind"]) {
  return inputs.map((field, current) => {
    if (current !== index) return field;
    const rest = { ...field };
    delete rest.default;
    delete rest.min_items;
    return {
      ...rest,
      kind,
      options: kind === "choice" ? (field.kind === "choice" ? field.options : ["Option 1"]) : [],
      ...(kind === "records" ? { min_items: field.kind === "records" ? field.min_items ?? 1 : 1 } : {}),
    } as SkillManifest["inputs"][number];
  });
}
const blankManifest = (): SkillManifest => {
  const value = skillTemplate("creer-skill")!;
  return { ...value, name: "Nouvelle méthode", description: "Une méthode personnalisée pour le CRM.", category: "organisation", tags: [], use_when: [], avoid_when: [], instructions: "Décris ici les règles métier, les limites et le format attendu.", inputs: [], tools: [], steps: [{ id: "analyser", title: "Analyser la demande", instruction: "Examiner les éléments fournis sans inventer de fait." }], resources: [], dependencies: [], examples: [], tests: [], output: { format: "brief", requirements: [] }, budget: { tool_calls: 0, output_tokens: 1200, duration_seconds: 30 } };
};
export function SkillsPage() {
  const { workspace, user } = useWorkspace();
  const query = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const idFromUrl = params.get("id");
  const [selected, setSelected] = useState(idFromUrl || "");
  const [tab, setTab] = useState<"mine" | "team" | "templates">("mine");
  const [filter, setFilter] = useState("");
  const [manifest, setManifest] = useState<SkillManifest | null>(null);
  const [advancedText, setAdvancedText] = useState("");
  const [advancedError, setAdvancedError] = useState("");
  const [visibility, setVisibility] = useState<"private" | "workspace">("private");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUser, setShareUser] = useState("");
  const [sharePermission, setSharePermission] = useState<"use" | "edit" | "publish">("use");
  const list = useQuery({ queryKey: ["skills", workspace.id, filter], queryFn: () => request<Listing>(endpoint(workspace.id) + "?q=" + encodeURIComponent(filter)) });
  const detail = useQuery({ queryKey: ["skill", workspace.id, selected], enabled: !!selected, queryFn: () => request<{ data: SkillDetail }>(endpoint(workspace.id) + "?id=" + selected) });
  const templates = useMemo(() => skillTemplateDefinitions.map((item) => ({ key: item.key, manifest: skillTemplate(item.key)! })), []);
  useEffect(() => { if (idFromUrl) setSelected(idFromUrl); }, [idFromUrl]);
  useEffect(() => {
    if (detail.data?.data) {
      setManifest(detail.data.data.draft ?? detail.data.data.versions.at(-1)?.manifest ?? null);
      const currentManifest = detail.data.data.draft ?? detail.data.data.versions.at(-1)?.manifest;
      setAdvancedText(JSON.stringify(currentManifest ? { examples: currentManifest.examples, tests: currentManifest.tests, resources: currentManifest.resources } : {}, null, 2));
      setAdvancedError("");
      setVisibility(detail.data.data.skill.visibility);
      setDirty(false);
    }
  }, [detail.data]);
  const entries = (list.data?.data ?? []).filter((item) => tab === "mine" ? item.visibility === "private" : item.visibility === "workspace");
  const editable = !!detail.data?.data.skill.can_edit && !!detail.data.data.draft;
  const canPublish = !!detail.data?.data.skill.can_publish && !!detail.data.data.draft;
  async function refresh() {
    await query.invalidateQueries({ queryKey: ["skills", workspace.id] });
    if (selected) await query.invalidateQueries({ queryKey: ["skill", workspace.id, selected] });
  }
  async function createFromTemplate(key: string) {
    const id = crypto.randomUUID();
    setBusy(true);
    try {
      await request(endpoint(workspace.id), "POST", { action: "install", id, key });
      await refresh();
      setTab("mine"); setSelected(id); router.replace(`/app/skills?workspace=${workspace.id}&id=${id}`);
      toast.success("Méthode ajoutée à vos brouillons");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Création impossible"); }
    finally { setBusy(false); }
  }
  async function createBlank() {
    const id = crypto.randomUUID();
    setBusy(true);
    try {
      await request(endpoint(workspace.id), "POST", { action: "create", id, visibility: "private", manifest: blankManifest() });
      await refresh(); setSelected(id); router.replace(`/app/skills?workspace=${workspace.id}&id=${id}`); toast.success("Brouillon créé");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Création impossible"); }
    finally { setBusy(false); }
  }
  function update(change: Partial<SkillManifest>) { setManifest((current) => current ? { ...current, ...change } : current); setDirty(true); }
  async function save() {
    if (!manifest || !detail.data?.data || !editable || advancedError) return;
    setBusy(true);
    try {
      await request(endpoint(workspace.id), "POST", { action: "save", id: selected, revision: detail.data.data.skill.revision, manifest: parseSkillManifest(manifest), visibility });
      await refresh(); setDirty(false); toast.success("Brouillon enregistré");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Enregistrement impossible"); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!manifest || !detail.data?.data || !canPublish || advancedError) return;
    const effects = manifest.tools.filter((tool) => toolEffects[tool] !== "read").map((tool) => `${tool} (${labelEffect(tool).toLowerCase()})`);
    if (!window.confirm(`Publier une nouvelle version de « ${manifest.name} » ?\n\nOutils de modification ou externes accordés à cette méthode : ${effects.length ? effects.join(", ") : "aucun"}.\n\nChaque action restera soumise au mode de validation de la conversation et aux autorisations du compte.`)) return;
    setBusy(true);
    try {
      const saved = await request<{ data: SkillDetail }>(endpoint(workspace.id), "POST", { action: "save", id: selected, revision: detail.data.data.skill.revision, manifest: parseSkillManifest(manifest), visibility });
      const revision = saved.data.skill.revision;
      await request(endpoint(workspace.id), "POST", { action: "publish", id: selected, revision });
      await refresh(); setDirty(false); toast.success("Version publiée");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Publication impossible"); }
    finally { setBusy(false); }
  }
  async function preference(patch: Record<string, unknown>) {
    const skill = detail.data?.data.skill;
    const publishedTools = detail.data?.data.versions.find((version) => version.id === skill?.published_version_id)?.manifest.tools;
    if (!skill?.published_version_id || !publishedTools) return;
    try {
      await request(endpoint(workspace.id), "POST", { action: "preference", id: selected, version_id: skill.published_version_id, granted_tools: publishedTools, ...patch });
      await refresh(); toast.success("Préférences enregistrées");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Modification impossible"); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const parsed = importSkill(await file.text());
      const id = crypto.randomUUID();
      await request(endpoint(workspace.id), "POST", { action: "import", id, content: exportSkill(parsed) });
      await refresh(); setSelected(id); setTab("mine"); router.replace(`/app/skills?workspace=${workspace.id}&id=${id}`); toast.success("Fichier importé comme brouillon privé");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Import impossible"); }
    finally { setBusy(false); }
  }
  function download() {
    if (!manifest) return;
    const url = URL.createObjectURL(new Blob([exportSkill(manifest)], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`; link.click(); URL.revokeObjectURL(url);
  }
  async function restore(versionId: string) {
    const current = detail.data?.data;
    if (!current) return;
    setBusy(true);
    try { await request(endpoint(workspace.id), "POST", { action: "restore", id: selected, revision: current.skill.revision, version_id: versionId }); await refresh(); toast.success("Version restaurée dans le brouillon"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Restauration impossible"); }
    finally { setBusy(false); }
  }
  async function grant() {
    if (!shareUser.trim()) return;
    setBusy(true);
    try { await request(endpoint(workspace.id), "POST", { action: "grant", id: selected, user_id: shareUser.trim(), permission: sharePermission }); await refresh(); setShareUser(""); toast.success("Accès accordé"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Partage impossible"); }
    finally { setBusy(false); }
  }
  function updateAdvanced(value: string) {
    setAdvancedText(value);
    try {
      const parsed = JSON.parse(value) as Partial<Pick<SkillManifest,"examples"|"tests"|"resources">>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).some((key)=>!(["examples","tests","resources"] as string[]).includes(key))) throw new Error("Utilisez uniquement les clés examples, tests et resources.");
      if (!manifest) throw new Error("Chargez un brouillon avant de modifier ces valeurs.");
      const next = parseSkillManifest({ ...manifest, ...parsed });
      setManifest(next); setDirty(true); setAdvancedError("");
    } catch (error) { setAdvancedError(error instanceof Error ? error.message : "JSON invalide"); }
  }
  async function archive() {
    if (!detail.data?.data || !detail.data.data.skill.can_publish) return;
    setBusy(true);
    try { await request(endpoint(workspace.id),"POST",{action:"archive",id:selected,revision:detail.data.data.skill.revision}); await refresh(); toast.success("Méthode archivée"); setSelected(""); router.replace(`/app/skills?workspace=${workspace.id}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Archivage impossible"); }
    finally { setBusy(false); }
  }
  async function loadMore() {
    if (!list.data?.next || moreBusy) return;
    setMoreBusy(true);
    try {
      const next = await request<Listing>(endpoint(workspace.id) + "?q=" + encodeURIComponent(filter) + "&after=" + list.data.next);
      query.setQueryData<Listing>(["skills", workspace.id, filter], (previous) => ({ data: [...(previous?.data ?? []), ...next.data], next: next.next }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Chargement impossible"); }
    finally { setMoreBusy(false); }
  }
  const setStep = (index: number, patch: Partial<SkillManifest["steps"][number]>) => update({ steps: manifest!.steps.map((step, i) => i === index ? { ...step, ...patch } : step) });
  if (selected && detail.isPending) return <main className={styles.page}><p>Ouverture de la méthode…</p></main>;
  if (selected && detail.data?.data && manifest) {
    const current = detail.data.data;
    const published = current.versions.find((version) => version.id === current.skill.published_version_id);
    const isAdmin = ["owner", "admin"].includes(workspace.role);
    return <main className={styles.page}>
      <div className={styles.editorTop}><button className={styles.back} onClick={() => { if (dirty && !window.confirm("Quitter sans enregistrer les modifications ?")) return; setSelected(""); router.replace(`/app/skills?workspace=${workspace.id}`); }}><ArrowLeft size={15}/> Bibliothèque</button><div className={styles.status}>{dirty ? "● Brouillon · Modifications non enregistrées" : current.skill.status === "published" ? `Publié · v${published?.number ?? "—"}` : "Brouillon"}</div><div className={styles.actions}><button onClick={download} title="Exporter"><ArrowDownToLine size={15}/> Exporter</button><button disabled={!editable || !dirty || busy || !!advancedError} onClick={() => void save()}>Enregistrer</button><button className={styles.primary} disabled={!canPublish || busy || !!advancedError} onClick={() => void publish()}><ShieldCheck size={15}/> Publier</button>{current.skill.status==="published"&&current.skill.can_publish&&<button disabled={busy} onClick={()=>void archive()}>Archiver</button>}</div></div>
      <div className={styles.editorGrid}>
        <section className={styles.editor}>
          <div className={styles.editorHeading}><Sparkles size={19}/><span>Éditeur de méthode</span></div>
          <label>Nom<input disabled={!editable} value={manifest.name} onChange={(e) => update({ name: e.target.value })}/></label>
          <label>Description<textarea disabled={!editable} rows={2} value={manifest.description} onChange={(e) => update({ description: e.target.value })}/></label>
          <div className={styles.two}><label>Catégorie<select disabled={!editable} value={manifest.category} onChange={(e) => update({ category: e.target.value as SkillManifest["category"] })}>{["commercial","suivi","analyse","redaction","organisation"].map((v) => <option key={v} value={v}>{v}</option>)}</select></label><label>Tags<input disabled={!editable} value={manifest.tags.join(", ")} onChange={(e) => update({ tags: e.target.value.split(",").map((v) => v.trim()).filter(Boolean).slice(0,8) })}/></label></div>
          <label>Quand utiliser cette méthode<textarea disabled={!editable} rows={2} value={manifest.use_when.join("\n")} onChange={(e) => update({ use_when: e.target.value.split("\n").filter(Boolean).slice(0,8) })}/></label>
          <label>Quand l’éviter<textarea disabled={!editable} rows={2} value={manifest.avoid_when.join("\n")} onChange={(e) => update({ avoid_when: e.target.value.split("\n").filter(Boolean).slice(0,8) })}/></label>
          <label>Instructions<textarea className={styles.largeText} disabled={!editable} rows={7} value={manifest.instructions} onChange={(e) => update({ instructions: e.target.value })}/></label>
          <div className={styles.sectionHeading}>Étapes <button disabled={!editable || manifest.steps.length >= 12} onClick={() => update({ steps: [...manifest.steps, { id: `etape_${crypto.randomUUID().replace(/-/g,"").slice(0,8)}`, title: "Nouvelle étape", instruction: "Décrivez cette étape." }] })}><Plus size={14}/> Ajouter</button></div>
          {manifest.steps.map((step, i) => <div className={styles.stepEditor} key={step.id}><span>{i+1}</span><div><input disabled={!editable} aria-label="Titre de l’étape" value={step.title} onChange={(e) => setStep(i,{title:e.target.value})}/><textarea disabled={!editable} rows={2} aria-label="Instruction de l’étape" value={step.instruction} onChange={(e) => setStep(i,{instruction:e.target.value})}/></div><button disabled={!editable || manifest.steps.length <= 1} onClick={() => update({ steps: manifest.steps.filter((_,j) => j !== i) })}>×</button></div>)}
          <div className={styles.sectionHeading}>Outils et autorisations <small>Le mode de validation du chat reste prioritaire.</small></div>
          <div className={styles.tools}>{(Object.keys(toolEffects) as ToolName[]).map((tool) => <label key={tool}><input disabled={!editable} type="checkbox" checked={manifest.tools.includes(tool)} onChange={(e) => update({ tools: e.target.checked ? [...manifest.tools,tool] : manifest.tools.filter((name) => name !== tool) })}/><code>{tool}</code><small>{labelEffect(tool)}</small></label>)}</div>
          <div className={styles.sectionHeading}>Budget de la méthode</div><div className={styles.three}><label>Appels outils<input disabled={!editable} type="number" min={0} max={15} value={manifest.budget.tool_calls} onChange={(e) => update({ budget:{...manifest.budget,tool_calls:Number(e.target.value)} })}/></label><label>Jetons de sortie<input disabled={!editable} type="number" min={500} max={3000} value={manifest.budget.output_tokens} onChange={(e) => update({ budget:{...manifest.budget,output_tokens:Number(e.target.value)} })}/></label><label>Durée max (s)<input disabled={!editable} type="number" min={5} max={60} value={manifest.budget.duration_seconds} onChange={(e) => update({ budget:{...manifest.budget,duration_seconds:Number(e.target.value)} })}/></label></div>
          <div className={styles.sectionHeading}>Format de réponse</div><div className={styles.two}><label>Format<select disabled={!editable} value={manifest.output.format} onChange={(e) => update({ output:{...manifest.output,format:e.target.value as SkillManifest["output"]["format"]} })}>{["brief","table","checklist","report","email","custom","skill_manifest"].map((v) => <option key={v} value={v}>{v}</option>)}</select></label><label>Exigences<textarea disabled={!editable} rows={2} value={manifest.output.requirements.join("\n")} onChange={(e) => update({ output:{...manifest.output,requirements:e.target.value.split("\n").filter(Boolean).slice(0,12)} })}/></label></div>
          <div className={styles.sectionHeading}>Champs de saisie</div>{manifest.inputs.map((field,i)=><div className={styles.inputEditor} key={field.key}><div className={styles.inputRow}><input disabled={!editable} value={field.key} aria-label="Clé" onChange={(e)=>update({inputs:manifest.inputs.map((f,n)=>n===i?{...f,key:e.target.value}:f)})}/><input disabled={!editable} value={field.label} aria-label="Libellé" onChange={(e)=>update({inputs:manifest.inputs.map((f,n)=>n===i?{...f,label:e.target.value}:f)})}/><select disabled={!editable} value={field.kind} onChange={(e)=>update({inputs:inputWithKind(manifest.inputs,i,e.target.value as SkillManifest["inputs"][number]["kind"] )})}>{["text","long_text","record","records","date","number","choice","boolean"].map((v)=><option key={v}>{v}</option>)}</select><label><input type="checkbox" disabled={!editable} checked={field.required} onChange={(e)=>update({inputs:manifest.inputs.map((f,n)=>n===i?{...f,required:e.target.checked}:f)})}/>Requis</label><button disabled={!editable} onClick={()=>update({inputs:manifest.inputs.filter((_,n)=>n!==i)})}>×</button></div>{field.kind==="choice"&&<label className={styles.optionEditor}>Options (séparées par des virgules)<input disabled={!editable} value={field.options.join(", ")} onChange={(e)=>update({inputs:manifest.inputs.map((f,n)=>n===i?{...f,options:e.target.value.split(",").map((v)=>v.trim()).filter(Boolean).slice(0,30)}:f)})}/></label>}{field.kind==="records"&&<label className={styles.optionEditor}>Nombre minimum de fiches<input disabled={!editable} type="number" min={1} max={20} value={field.min_items??1} onChange={(e)=>update({inputs:manifest.inputs.map((f,n)=>n===i?{...f,min_items:Number(e.target.value)}:f)})}/></label>}</div>)}<button className={styles.secondary} disabled={!editable || manifest.inputs.length>=12} onClick={()=>update({inputs:[...manifest.inputs,{key:`champ_${crypto.randomUUID().replace(/-/g,"").slice(0,8)}`,label:"Nouveau champ",kind:"text",required:false,options:[]}]})}><Plus size={14}/> Ajouter un champ</button>
          <details className={styles.advanced}><summary>Exemples, cas d’évaluation et ressources</summary><p>{manifest.examples.length} exemple(s) · {manifest.tests.length} cas · {manifest.resources.length} ressource(s). Les IDs de ressources sont revérifiés selon vos droits à chaque enregistrement et exécution.</p><textarea disabled={!editable} rows={12} value={advancedText} onChange={(e)=>updateAdvanced(e.target.value)}/>{advancedError&&<small role="alert">{advancedError}</small>}<small>JSON structuré : examples, tests et resources. Les erreurs bloquent l’enregistrement.</small></details>
          <div className={styles.sectionHeading}>Partage de la méthode</div><label>Visibilité<select disabled={!editable || (current.skill.owner_id !== user.id && !isAdmin)} value={visibility} onChange={(e) => { setVisibility(e.target.value as "private" | "workspace"); setDirty(true); }}><option value="private">Privée</option><option value="workspace" disabled={!isAdmin}>Espace (administrateurs)</option></select></label>
          {current.grants.map((grant)=><div className={styles.grant} key={grant.user_id}><span>{grant.user_id}</span><span>{grant.permission}</span><button disabled={!current.skill.can_publish || busy} onClick={()=>void request(endpoint(workspace.id),"POST",{action:"grant",id:selected,user_id:grant.user_id,permission:null}).then(refresh).catch((e)=>toast.error(e.message))}>Retirer</button></div>)}
          {current.skill.can_publish&&<><button className={styles.secondary} onClick={()=>setSharing((v)=>!v)}><Plus size={14}/> Accorder un accès</button>{sharing&&<div className={styles.shareForm}><input placeholder="ID utilisateur de l’espace" value={shareUser} onChange={(e)=>setShareUser(e.target.value)}/><select value={sharePermission} onChange={(e)=>setSharePermission(e.target.value as typeof sharePermission)}><option value="use">Utiliser</option><option value="edit">Modifier</option><option value="publish">Publier</option></select><button disabled={busy} onClick={()=>void grant()}>Accorder</button></div>}</>}
          {current.skill.published_version_id&&<div className={styles.preference}><label><input type="checkbox" checked={current.skill.enabled} onChange={(e)=>void preference({enabled:e.target.checked})}/> Utilisable dans le chat</label><label><input type="checkbox" checked={current.skill.favorite} onChange={(e)=>void preference({favorite:e.target.checked})}/> Favori</label><p>La méthode est choisie explicitement dans le chat. Ses outils restent limités aux droits accordés, aux intégrations connectées et au mode de validation courant.</p></div>}
        </section>
        <aside className={styles.preview}><div className={styles.previewHeading}><Eye size={16}/> Aperçu en direct</div><span className={styles.category}>{manifest.category}</span><h1>{manifest.name || "Sans titre"}</h1><p>{manifest.description}</p><div className={styles.previewBlock}><strong>Instructions</strong><p>{manifest.instructions}</p></div><div className={styles.previewBlock}><strong>Étapes</strong><ol>{manifest.steps.map((step)=><li key={step.id}>{step.title}<small>{step.instruction}</small></li>)}</ol></div><div className={styles.previewBlock}><strong>Autorisations</strong><div className={styles.badges}>{manifest.tools.length?manifest.tools.map((tool)=><span key={tool} data-effect={toolEffects[tool]}>{tool} · {labelEffect(tool)}</span>):<small>Aucun outil CRM : rédaction seulement.</small>}</div></div><div className={styles.previewBlock}><strong>Limites</strong><p>{manifest.budget.tool_calls} appels · {manifest.budget.output_tokens} jetons · {manifest.budget.duration_seconds} s max</p></div><div className={styles.previewBlock}><strong>Champs nécessaires</strong>{manifest.inputs.length?manifest.inputs.map((input)=><div className={styles.inputPreview} key={input.key}>{input.label}{input.required&&<i>Requis</i>}</div>):<small>Aucune saisie supplémentaire.</small>}</div></aside>
      </div>
      <section className={styles.versions}><h2><Clock3 size={16}/> Historique des versions</h2>{current.versions.length?current.versions.map((version)=><div key={version.id}><span><strong>Version {version.number}</strong><small>{new Date(version.created_at).toLocaleString("fr-FR")} · {version.manifest.name}</small></span><button disabled={!editable||busy} onClick={()=>void restore(version.id)}>Restaurer dans le brouillon</button></div>):<p>La première version apparaîtra lors de la publication.</p>}{current.runs.length>0&&<><h2>Exécutions récentes</h2>{current.runs.map((run)=><div key={run.id}><span><strong>{run.status}</strong><small>{new Date(run.created_at).toLocaleString("fr-FR")} · mode {run.mode} · v{current.versions.find(v=>v.id===run.version_id)?.number??"—"}</small></span></div>)}</>}</section>
    </main>;
  }
  return <main className={styles.page}>
    <header className={styles.libraryHeader}><div><span className={styles.eyebrow}><WandSparkles size={14}/> Studio de méthodes</span><h1>Bibliothèque de skills</h1><p>Des méthodes réutilisables pour guider l’agent, avec un aperçu clair de leurs accès.</p></div><div className={styles.actions}><label className={styles.importButton}><ArrowUpFromLine size={15}/> Importer<input type="file" accept=".md,.json,text/markdown,application/json" onChange={(e)=>void importFile(e.target.files?.[0])}/></label><button onClick={()=>void createBlank()} disabled={busy}><Plus size={15}/> Nouvelle méthode</button></div></header>
    <div className={styles.tabs}><button data-active={tab==="mine"} onClick={()=>setTab("mine")}>Mes méthodes</button><button data-active={tab==="team"} onClick={()=>setTab("team")}>Équipe</button><button data-active={tab==="templates"} onClick={()=>setTab("templates")}>Modèles</button><label><Search size={14}/><input placeholder="Rechercher…" value={filter} onChange={(e)=>setFilter(e.target.value)}/></label></div>
    {tab==="templates"?<div className={styles.cards}>{templates.filter((t)=>!filter||`${t.manifest.name} ${t.manifest.description}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map((item)=><article key={item.key}><span className={styles.category}>{item.manifest.category}</span><h2>{item.manifest.name}</h2><p>{item.manifest.description}</p><small>{item.manifest.tools.length} outils · {item.manifest.steps.length} étapes</small><button disabled={busy} onClick={()=>void createFromTemplate(item.key)}><Plus size={14}/> Ajouter à mes brouillons</button></article>)}</div>:list.isPending?<p className={styles.empty}>Chargement…</p>:entries.length?<><div className={styles.list}>{entries.map((skill)=><button key={skill.id} className={styles.skillRow} onClick={()=>{setSelected(skill.id);router.replace(`/app/skills?workspace=${workspace.id}&id=${skill.id}`)}}><span className={styles.skillIcon}><Sparkles size={16}/></span><span className={styles.skillInfo}><strong>{skill.name}{skill.favorite&&<Heart size={12} fill="currentColor"/>}</strong><small>{skill.description}</small></span><span className={styles.pill}>{skill.status==="published"?"Publié":"Brouillon"}</span><span className={styles.pill}>v{skill.revision}</span><span className={styles.toolCount}>{skill.granted_tools.length} accès accordés</span></button>)}</div>{list.data?.next&&<button className={styles.loadMore} disabled={moreBusy} onClick={()=>void loadMore()}>{moreBusy?"Chargement…":"Charger les méthodes suivantes"}</button>}</>:<div className={styles.empty}><Sparkles size={24}/><h2>Aucune méthode {tab==="mine"?"personnelle":"d’équipe"}</h2><p>Ajoutez un modèle, importez un fichier ou créez un brouillon.</p><button onClick={()=>setTab("templates")}><Plus size={14}/> Parcourir les modèles</button></div>}
    {tab!=="templates"&&<footer className={styles.libraryFoot}><Check size={14}/> Les méthodes ne gagnent jamais de permissions en changeant le mode de validation du chat.</footer>}
  </main>;
}
