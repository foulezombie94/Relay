import type { ToolName } from "./contracts";

// MCP Apps (spec 2026-01-26): interactive cards rendered by the host (ChatGPT, Claude,
// VS Code…) inside a sandboxed iframe. Each view is a self-contained HTML document with
// the Zyliad design tokens. It talks to the host over postMessage JSON-RPC (ui/initialize,
// tools/call, ui/message, ui/open-link) and falls back to ChatGPT's window.openai.
// Security: no network access (default CSP), every value is rendered as text and links only
// open Zyliad pages. "Oui" / "Non" on a proposal are the user's own clicks: they call
// zyliad_confirm_command through the host, which re-checks rights, roles and versions.

export const appMimeType = "text/html;profile=mcp-app";
export const appViews = ["record", "results", "proposal", "duplicates", "pipeline"] as const;
export type AppView = (typeof appViews)[number];
export const appUri = (view: AppView) => `ui://zyliad/${view}.html`;

const writeTools: ToolName[] = [
  "zyliad_create_record",
  "zyliad_update_record",
  "zyliad_create_task",
  "zyliad_update_task",
  "zyliad_create_note",
  "zyliad_update_note",
  "zyliad_update_commitment",
  "zyliad_create_workflow_draft",
  "zyliad_update_workflow_draft",
  "zyliad_add_to_list",
  "zyliad_remove_from_list",
  "zyliad_merge_records",
  "zyliad_create_field",
  "zyliad_update_pipeline_stages",
  "zyliad_command_status",
  "zyliad_confirm_command",
];
export const toolViews: Partial<Record<ToolName, AppView>> = {
  zyliad_get_record: "record",
  zyliad_record_context: "record",
  zyliad_search_records: "results",
  zyliad_get_records: "results",
  zyliad_list_records: "results",
  zyliad_find_duplicates: "duplicates",
  zyliad_aggregate: "pipeline",
  ...Object.fromEntries(writeTools.map((name) => [name, "proposal" as const])),
};
const invoking: Record<AppView, [string, string]> = {
  record: ["Ouverture de la fiche…", "Fiche affichée"],
  results: ["Recherche en cours…", "Résultats affichés"],
  proposal: ["Préparation de la proposition…", "Proposition prête à confirmer"],
  duplicates: ["Recherche des doublons…", "Doublons affichés"],
  pipeline: ["Calcul en cours…", "Graphique affiché"],
};
/** Tool metadata linking a tool to its card (MCP Apps key plus ChatGPT aliases). */
export function toolAppMeta(name: ToolName) {
  const view = toolViews[name];
  if (!view) return undefined;
  return {
    ui: { resourceUri: appUri(view) },
    "openai/outputTemplate": appUri(view),
    "openai/toolInvocation/invoking": invoking[view][0],
    "openai/toolInvocation/invoked": invoking[view][1],
  };
}
const descriptions: Record<AppView, string> = {
  record: "Carte interactive d’une fiche Zyliad.",
  results: "Liste interactive de fiches Zyliad, avec choix d’une fiche.",
  proposal:
    "Carte de proposition Zyliad avec choix Oui / Non : Oui exécute la modification, Non l’annule.",
  duplicates: "Comparaison interactive de doublons potentiels.",
  pipeline: "Graphique interactif d’un agrégat CRM.",
};
export function appResourceMeta(view: AppView) {
  return {
    ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
    "openai/widgetDescription": descriptions[view],
    "openai/widgetPrefersBorder": true,
  };
}

const css = `
:root{--accent:#365de3;--surface:#fff;--soft:#fafafa;--hover:#f1f1f3;--border:#e9e9ed;--ink:#242529;--muted:#74767f;--ok:#1f8a4c;--warn:#b26a00;--bad:#c2410c;--radius:12px;color-scheme:light}
:root[data-theme=dark]{--surface:#191a1f;--soft:#1f2026;--hover:#2b2d35;--border:#30323c;--ink:#ededf2;--muted:#a0a2af;color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--surface:#191a1f;--soft:#1f2026;--hover:#2b2d35;--border:#30323c;--ink:#ededf2;--muted:#a0a2af;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;padding:12px;font:14px/1.45 "DM Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:transparent}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;box-shadow:0 1px 2px #00000008}
.card+.card{margin-top:10px}
.head{display:flex;gap:12px;align-items:center}
.avatar{flex:0 0 40px;height:40px;border-radius:10px;display:grid;place-items:center;font-weight:700;color:#fff;background:var(--accent)}
.title{font-size:16px;font-weight:650;margin:0;overflow-wrap:anywhere}
.sub{color:var(--muted);font-size:12.5px;margin:2px 0 0}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.chip{border:1px solid var(--border);background:var(--soft);border-radius:999px;padding:3px 10px;font-size:12px;color:var(--ink)}
.chip b{font-weight:600}
.grid{display:grid;grid-template-columns:minmax(90px,max-content) 1fr;gap:6px 14px;margin-top:12px;font-size:13px}
.grid dt{color:var(--muted)}.grid dd{margin:0;overflow-wrap:anywhere}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
button{font:inherit;font-size:13px;border-radius:9px;padding:7px 12px;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--ink)}
button:hover{background:var(--hover)}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
button.primary:hover{filter:brightness(1.08)}
button.danger{color:var(--bad)}
button:disabled{opacity:.55;cursor:default}
.list{display:grid;gap:8px}
.row{display:flex;gap:10px;align-items:center;border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--surface)}
.row .grow{flex:1;min-width:0}
.row .name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.status{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;background:var(--soft);border:1px solid var(--border)}
.status.pending{color:var(--warn)}.status.executed{color:var(--ok)}.status.rejected,.status.expired{color:var(--bad)}
.note{color:var(--muted);font-size:12.5px;margin-top:10px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.side{border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--soft);font-size:12.5px;min-width:0}
.bar{display:grid;grid-template-columns:minmax(80px,30%) 1fr auto;gap:10px;align-items:center;font-size:13px;margin:6px 0}
.track{height:10px;border-radius:999px;background:var(--hover);overflow:hidden}
.fill{height:100%;background:var(--accent);border-radius:999px}
.empty{color:var(--muted);text-align:center;padding:18px}
.error{color:var(--bad);font-size:12.5px;margin-top:8px}
`;

// Plain ES5-style script (no template literals) so it can live inside this TS string.
const script = `
var VIEW="__VIEW__",ORIGIN="__ORIGIN__",root=document.getElementById("root");
var state={input:null,result:null,extra:null,done:null,error:""},seq=0,pending={};
var actionLabels={create_record:"Créer une fiche",update_record:"Modifier une fiche",create_task:"Créer une tâche",update_task:"Modifier une tâche",create_note:"Créer une note privée",update_note:"Modifier une note",update_commitment:"Mettre à jour un engagement",create_workflow_draft:"Créer un brouillon de workflow",update_workflow_draft:"Modifier un workflow",add_to_list:"Ajouter à une liste",remove_from_list:"Retirer d’une liste",merge_records:"Fusionner deux doublons",create_attribute:"Créer un champ",save_pipeline_stages:"Modifier les étapes d’un pipeline"};
var fieldLabels={title:"Titre",description:"Description",due_date:"Échéance",record_id:"Fiche",owner_id:"Responsable",status:"Statut",priority:"Priorité",content:"Contenu",private:"Privée",display_name:"Nom",email:"Email",domain:"Domaine",stage:"Étape",amount:"Montant",currency:"Devise",close_date:"Clôture",probability:"Probabilité",lost_reason:"Raison de perte",attributes:"Champs",object_id:"Type",pipeline_id:"Pipeline",id:"Identifiant",version:"Version",values:"Valeurs",list_id:"Liste",evidence:"Preuve",name:"Nom",definition:"Définition",key:"Clé",type:"Type",required:"Obligatoire",options:"Options",source_id:"Fiche source",target_id:"Fiche conservée",source_version:"Version source",target_version:"Version conservée",choices:"Choix",stages:"Étapes",labels:"Libellés",probabilities:"Probabilités",moves:"Déplacements"};
function fieldLabel(path){return path.split(".").map(function(p){return fieldLabels[p]||p}).join(" › ")}
var sectionLabels={task:"Tâches",note:"Notes",meeting:"Réunions",email:"Emails",calendar:"Agenda",document:"Documents",commitment:"Engagements",conflict:"Conflits"};
var statusLabels={pending:"En attente de votre confirmation",executed:"Exécutée",rejected:"Refusée",expired:"Expirée"};
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=String(text);return e}
function btn(label,cls,fn){var b=el("button",cls,label);b.type="button";b.onclick=function(){fn(b)};return b}
function send(m){window.parent.postMessage(m,"*")}
function rpc(method,params){return new Promise(function(ok,ko){var id=++seq;pending[id]={ok:ok,ko:ko};send({jsonrpc:"2.0",id:id,method:method,params:params||{}});setTimeout(function(){if(pending[id]){delete pending[id];ko(new Error("timeout"))}},20000)})}
function oa(){return window.openai||null}
function openLink(url){if(typeof url!=="string"||url.indexOf(ORIGIN+"/")!==0)return Promise.resolve();if(oa()&&oa().openExternal)return Promise.resolve(oa().openExternal({href:url}));return rpc("ui/open-link",{url:url})}
function say(text){if(oa()&&oa().sendFollowUpMessage)return Promise.resolve(oa().sendFollowUpMessage({prompt:text}));return rpc("ui/message",{role:"user",content:{type:"text",text:text}})}
function callTool(name,args){if(oa()&&oa().callTool)return Promise.resolve(oa().callTool(name,args));return rpc("tools/call",{name:name,arguments:args})}
function structured(r){if(!r)return null;if(r.structuredContent)return r.structuredContent;return r}
function payload(){var s=structured(state.result);return s&&s.data!==undefined?s.data:s}
function money(v,c){var n=Number(v);if(!isFinite(n))return String(v);try{return n.toLocaleString("fr-FR",{style:"currency",currency:c||"EUR",maximumFractionDigits:0})}catch(e){return n.toLocaleString("fr-FR")+" "+(c||"")}}
function initials(n){return String(n||"?").split(/\\s+/).filter(Boolean).slice(0,2).map(function(p){return p.charAt(0).toUpperCase()}).join("")||"?"}
function recordName(r){return r&&(r.display_name||r.name||r.label||r.title)||"Sans nom"}
function zyliadSearch(name){return ORIGIN+"/app/search?q="+encodeURIComponent(name)}
function failure(e){state.error="Action impossible pour le moment. Réessayez ou demandez à l’assistant.";render()}
function chips(r){var c=el("div","chips");function add(l,v){if(v===null||v===undefined||v==="")return;var s=el("span","chip");s.appendChild(el("b",null,l+" "));s.appendChild(document.createTextNode(String(v)));c.appendChild(s)}
 add("Étape",r.stage);if(r.amount!=null&&Number(r.amount)!==0)add("Montant",money(r.amount,r.currency));add("Email",r.email);add("Domaine",r.domain);add("Clôture",r.close_date);if(r.probability!=null)add("Probabilité",r.probability+" %");return c}
function recordCard(r,extra){var card=el("div","card"),head=el("div","head");head.appendChild(el("div","avatar",initials(recordName(r))));var t=el("div");t.appendChild(el("p","title",recordName(r)));t.appendChild(el("p","sub","Version "+(r.version||"–")+(r.updated_at?" · mise à jour le "+String(r.updated_at).slice(0,10):"")));head.appendChild(t);card.appendChild(head);card.appendChild(chips(r));
 var attrs=r.attributes&&typeof r.attributes==="object"?Object.keys(r.attributes):[];if(attrs.length){var g=el("dl","grid");attrs.slice(0,12).forEach(function(k){g.appendChild(el("dt",null,k));g.appendChild(el("dd",null,typeof r.attributes[k]==="object"?JSON.stringify(r.attributes[k]):r.attributes[k]))});card.appendChild(g)}
 if(extra&&extra.sections){var s=el("div","chips");Object.keys(extra.sections).forEach(function(k){var d=extra.sections[k]&&extra.sections[k].data;s.appendChild(el("span","chip",(sectionLabels[k]||k)+" : "+(d?d.length:0)))});card.appendChild(s)}
 var a=el("div","actions");a.appendChild(btn("Ouvrir dans Zyliad","primary",function(){openLink(zyliadSearch(recordName(r))).catch(failure)}));
 a.appendChild(btn("Voir le contexte",null,function(b){b.disabled=true;callTool("zyliad_record_context",{record_id:r.id,sections:["task","note","meeting"],limit:3}).then(function(res){var d=structured(res);state.extra=d&&d.data?d.data:d;state.error=res&&res.isError?"Contexte indisponible avec vos permissions actuelles.":"";render()}).catch(failure)}));
 a.appendChild(btn("Préparer une relance",null,function(){say("Prépare une relance pour la fiche « "+recordName(r)+" » ("+r.id+").").catch(failure)}));
 a.appendChild(btn("Créer une tâche",null,function(){say("Propose une tâche de suivi pour la fiche « "+recordName(r)+" » ("+r.id+").").catch(failure)}));
 card.appendChild(a);return card}
function renderRecord(d){var r=d&&(d.record||d);if(!r||!r.id)return empty("Aucune fiche à afficher.");root.appendChild(recordCard(r,state.extra||d))}
function renderResults(d){var rows=(d&&(d.data||d.records))||[];if(!Array.isArray(rows)||!rows.length)return empty("Aucune fiche trouvée dans le périmètre autorisé.");var list=el("div","list");
 rows.slice(0,20).forEach(function(item){var r=item.record||item,row=el("div","row");row.appendChild(el("div","avatar",initials(recordName(r))));var g=el("div","grow");g.appendChild(el("div","name",recordName(r)));var sub=[r.stage,r.amount!=null&&Number(r.amount)!==0?money(r.amount,r.currency):null,r.email||r.domain].filter(Boolean).join(" · ");g.appendChild(el("div","sub",sub||"Fiche CRM"));row.appendChild(g);
  row.appendChild(btn("Détails",null,function(b){b.disabled=true;callTool("zyliad_get_record",{record_id:r.id}).then(function(res){var x=structured(res);var rec=x&&x.data&&x.data.record;if(rec){list.replaceChildren(recordCard(rec))}else{state.error="Fiche inaccessible.";render()}}).catch(failure)}));
  row.appendChild(btn("Choisir","primary",function(b){b.disabled=true;say("Je choisis la fiche « "+recordName(r)+" » ("+r.id+").").catch(failure)}));list.appendChild(row)});
 root.appendChild(list);if(d&&d.has_more)root.appendChild(el("p","note","D’autres résultats existent : demandez la page suivante."))}
function flatten(v,prefix,out){if(v&&typeof v==="object"&&!Array.isArray(v)){Object.keys(v).forEach(function(k){flatten(v[k],prefix?prefix+"."+k:k,out)})}else out.push([prefix,Array.isArray(v)?v.join(", "):v]);return out}
function renderProposal(d){var input=state.input||{},values=input.values||{},result=d||{},status=state.done||result.status||"pending",action=result.action||"";
 var card=el("div","card"),head=el("div","head");head.appendChild(el("div","avatar",status==="executed"?"✓":status==="pending"?"✎":"✕"));var t=el("div");t.appendChild(el("p","title",actionLabels[action]||"Proposition de modification"));var st=el("span","status "+status,statusLabels[status]||status);t.appendChild(st);head.appendChild(t);card.appendChild(head);
 var rows=flatten(values,"",[]).filter(function(p){return p[1]!==undefined&&p[1]!==null&&p[1]!==""});if(rows.length){var g=el("dl","grid");rows.slice(0,30).forEach(function(p){g.appendChild(el("dt",null,fieldLabel(p[0])));g.appendChild(el("dd",null,p[1]))});card.appendChild(g)}
 card.appendChild(el("p","note",status==="executed"?"Modification confirmée et exécutée dans Zyliad.":status==="pending"?"Rien n’est modifié avant votre réponse."+(result.expires_at?" Expire le "+new Date(result.expires_at).toLocaleString("fr-FR")+".":""):"Aucune modification n’a été exécutée par cette proposition."));
 function decide(decision,b){b.disabled=true;state.error="";callTool("zyliad_confirm_command",{id:result.id,decision:decision}).then(function(res){var x=structured(res);var s=x&&x.data&&x.data.status;if(res&&res.isError||!s){state.error=decision==="approve"?"La modification n’a pas pu être exécutée (droits, version ou expiration). Demandez à l’assistant.":"Le refus n’a pas pu être enregistré.";render();return}state.done=s;render();say(s==="executed"?"Oui : la proposition "+result.id+" est confirmée et exécutée.":"Non : la proposition "+result.id+" est annulée. Ne la reprends pas.").catch(function(){})}).catch(failure)}
 var a=el("div","actions");if(status==="pending"&&result.id){a.appendChild(btn("Oui, confirmer","primary",function(b){decide("approve",b)}));
  a.appendChild(btn("Non, annuler","danger",function(b){decide("reject",b)}));
  if(result.confirmation_url)a.appendChild(btn("Voir dans Zyliad",null,function(){openLink(result.confirmation_url).catch(failure)}))}
 if(result.id)a.appendChild(btn("Vérifier le statut",null,function(b){b.disabled=true;callTool("zyliad_command_status",{id:result.id}).then(function(res){var x=structured(res);var s=x&&x.data&&x.data.status;if(s){state.done=s}else{state.error="Statut indisponible."}render()}).catch(failure)}));
 card.appendChild(a);root.appendChild(card)}
function side(r){var s=el("div","side");s.appendChild(el("div","name",recordName(r)));[["Email",r.email],["Domaine",r.domain],["Étape",r.stage],["Version",r.version]].forEach(function(p){if(p[1]!=null&&p[1]!=="")s.appendChild(el("div","sub",p[0]+" : "+p[1]))});return s}
function renderDuplicates(d){var inner=d&&d.data&&!Array.isArray(d.data)?d.data:d,pairs=(inner&&inner.data)||[];if(!Array.isArray(pairs)||!pairs.length)return empty("Aucun doublon potentiel détecté.");
 pairs.slice(0,10).forEach(function(p){if(!p.a||!p.b)return;var card=el("div","card"),pair=el("div","pair");pair.appendChild(side(p.a));pair.appendChild(side(p.b));card.appendChild(pair);var a=el("div","actions");
  a.appendChild(btn("Fusionner (garder la 2e)","primary",function(){say("Propose la fusion de « "+recordName(p.a)+" » ("+p.a.id+", version "+p.a.version+") dans « "+recordName(p.b)+" » ("+p.b.id+", version "+p.b.version+").").catch(failure)}));
  a.appendChild(btn("Fusionner (garder la 1re)",null,function(){say("Propose la fusion de « "+recordName(p.b)+" » ("+p.b.id+", version "+p.b.version+") dans « "+recordName(p.a)+" » ("+p.a.id+", version "+p.a.version+").").catch(failure)}));
  a.appendChild(btn("Pas des doublons",null,function(b){b.disabled=true;say("« "+recordName(p.a)+" » et « "+recordName(p.b)+" » ne sont pas des doublons.").catch(failure)}));card.appendChild(a);root.appendChild(card)})}
function metric(row){var keys=["sum","total","amount","count","value","average","avg"];for(var i=0;i<keys.length;i++){if(row[keys[i]]!=null&&isFinite(Number(row[keys[i]])))return {key:keys[i],value:Number(row[keys[i]])}}for(var k in row){if(k!=="dimension"&&isFinite(Number(row[k]))&&typeof row[k]!=="boolean")return {key:k,value:Number(row[k])}}return null}
function renderPipeline(d){var rows=(d&&d.data)||[];if(!Array.isArray(rows)||!rows.length)return empty("Aucune donnée à représenter.");var card=el("div","card");card.appendChild(el("p","title","Répartition"));var max=0,items=rows.slice(0,30).map(function(r){var m=metric(r)||{key:"",value:0};max=Math.max(max,m.value);return {label:r.dimension==null?"(vide)":String(r.dimension)+(r.currency?" · "+r.currency:""),m:m,raw:r}});
 items.forEach(function(it){var bar=el("div","bar");bar.appendChild(el("div","sub",it.label));var tr=el("div","track"),f=el("div","fill");f.style.width=(max?Math.max(2,Math.round(it.m.value/max*100)):0)+"%";tr.appendChild(f);bar.appendChild(tr);bar.appendChild(el("div",null,it.m.key==="count"?it.m.value.toLocaleString("fr-FR"):money(it.m.value,it.raw.currency)));bar.style.cursor="pointer";bar.title="Analyser ce groupe";bar.onclick=function(){say("Analyse le groupe « "+it.label+" » de cet agrégat.").catch(failure)};card.appendChild(bar)});
 if(d.partial)card.appendChild(el("p","note","Résultat partiel : précisez les filtres."));root.appendChild(card)}
function empty(text){root.appendChild(el("div","card empty",text))}
function render(){root.replaceChildren();var d=payload();if(!state.result&&!state.input){root.appendChild(el("div","card empty","Chargement…"));return}
 if(state.result&&state.result.isError){empty("Cette action n’a pas abouti. L’assistant vous indique la raison.");return}
 try{({record:renderRecord,results:renderResults,proposal:renderProposal,duplicates:renderDuplicates,pipeline:renderPipeline})[VIEW](d)}catch(e){empty("Affichage indisponible pour ce résultat.")}
 if(state.error)root.appendChild(el("p","error",state.error))}
function theme(t){if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}
window.addEventListener("message",function(e){if(e.source!==window.parent)return;var m=e.data;if(!m||m.jsonrpc!=="2.0")return;
 if(m.id!=null&&!m.method&&pending[m.id]){var p=pending[m.id];delete pending[m.id];if(m.error)p.ko(m.error);else p.ok(m.result);return}
 if(m.method==="ui/notifications/tool-input"){state.input=m.params&&m.params.arguments||null;render()}
 else if(m.method==="ui/notifications/tool-result"){state.result=m.params||null;render()}
 else if(m.method==="ui/notifications/host-context-changed"){theme(m.params&&m.params.theme)}
 else if(m.method==="ui/resource-teardown"&&m.id!=null){send({jsonrpc:"2.0",id:m.id,result:{}})}});
function fromOpenAI(){var o=oa();if(!o)return false;if(o.toolInput)state.input=o.toolInput;if(o.toolOutput)state.result={structuredContent:o.toolOutput};theme(o.theme);render();return true}
window.addEventListener("openai:set_globals",fromOpenAI);
if(!fromOpenAI())render();
rpc("ui/initialize",{appInfo:{name:"Zyliad",version:"1.4.0"},appCapabilities:{},protocolVersion:"2026-01-26"}).then(function(r){theme(r&&r.hostContext&&r.hostContext.theme);send({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}})}).catch(function(){});
if(window.ResizeObserver)new ResizeObserver(function(){var h=document.documentElement.scrollHeight;send({jsonrpc:"2.0",method:"ui/notifications/size-changed",params:{width:document.documentElement.scrollWidth,height:h}});if(oa()&&oa().notifyIntrinsicHeight)oa().notifyIntrinsicHeight(h)}).observe(document.body);
`;

/** Self-contained HTML document for one view. */
export function widgetHtml(view: AppView, origin: string) {
  const safeOrigin = JSON.stringify(origin).slice(1, -1).replace(/</g, "\\u003c");
  const body = script.replace("__VIEW__", view).replace("__ORIGIN__", safeOrigin);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zyliad</title><style>${css}</style></head><body><div id="root" role="region" aria-label="Zyliad"></div><script>${body}</script></body></html>`;
}
