import type { ToolName } from "./contracts";

// MCP Apps (spec 2026-01-26): interactive cards rendered by the host (ChatGPT, Claude,
// VS Code…) inside a sandboxed iframe. Each view is a self-contained HTML document with
// the Zyliad design tokens. It talks to the host over postMessage JSON-RPC (ui/initialize,
// tools/call, ui/message, ui/open-link) and falls back to ChatGPT's window.openai.
// Security: no network access (default CSP), every value is rendered as text (icons are
// built with createElementNS from constant shapes) and links only open Zyliad pages.
// "Confirmer" / "Annuler" on a proposal are the user's own clicks: they call
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
  proposal: "Carte de proposition Zyliad : Confirmer exécute la modification, Annuler la supprime.",
  duplicates: "Comparaison interactive de doublons potentiels.",
  pipeline: "Graphique interactif d’un agrégat CRM.",
};
export function appResourceMeta(view: AppView) {
  return {
    // The card draws its own frame, so the host does not add a second border.
    ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } },
    "openai/widgetDescription": descriptions[view],
    "openai/widgetPrefersBorder": false,
  };
}

// Neutral, dense CRM look: hairline borders, property rows with icon labels, soft
// coloured tags, compact buttons with a dark primary. Light and dark themes.
const css = `
:root{color-scheme:light;--bg:#fff;--subtle:#f9f9fa;--hover:#f3f3f5;--line:#ececef;--line-2:#e1e1e5;--ink:#1d1e21;--ink-2:#4a4c52;--muted:#7c7e86;--faint:#a8aab0;--accent:#365de3;--primary:#1d1e21;--on-primary:#fff;--shadow:0 1px 2px rgba(16,17,20,.05),0 0 0 1px rgba(16,17,20,.02);
--gray-bg:#f1f1ef;--gray:#5f5e5b;--blue-bg:#e8effd;--blue:#2756c5;--green-bg:#e6f4ea;--green:#1d7a44;--orange-bg:#fdf0e2;--orange:#b0590c;--red-bg:#fdeceb;--red:#c13a31;--purple-bg:#f1edfb;--purple:#6943b4;--pink-bg:#fcecf4;--pink:#b23a78;--teal-bg:#e3f4f3;--teal:#1b7470}
:root[data-theme=dark]{color-scheme:dark;--bg:#1c1c1f;--subtle:#202024;--hover:#2a2a2f;--line:#2d2d32;--line-2:#3a3a40;--ink:#ececef;--ink-2:#c3c4c9;--muted:#8f9198;--faint:#64666d;--primary:#ececef;--on-primary:#151517;--shadow:0 1px 2px rgba(0,0,0,.3);
--gray-bg:rgba(255,255,255,.08);--gray:#c8c8cc;--blue-bg:rgba(77,138,255,.16);--blue:#93b6ff;--green-bg:rgba(52,168,98,.16);--green:#7fd3a1;--orange-bg:rgba(236,146,48,.16);--orange:#f2b471;--red-bg:rgba(236,88,76,.16);--red:#f39d95;--purple-bg:rgba(150,112,236,.18);--purple:#c5aaf6;--pink-bg:rgba(230,90,160,.16);--pink:#f2a3cb;--teal-bg:rgba(40,180,170,.16);--teal:#7fd6cf}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--bg:#1c1c1f;--subtle:#202024;--hover:#2a2a2f;--line:#2d2d32;--line-2:#3a3a40;--ink:#ececef;--ink-2:#c3c4c9;--muted:#8f9198;--faint:#64666d;--primary:#ececef;--on-primary:#151517;--shadow:0 1px 2px rgba(0,0,0,.3);
--gray-bg:rgba(255,255,255,.08);--gray:#c8c8cc;--blue-bg:rgba(77,138,255,.16);--blue:#93b6ff;--green-bg:rgba(52,168,98,.16);--green:#7fd3a1;--orange-bg:rgba(236,146,48,.16);--orange:#f2b471;--red-bg:rgba(236,88,76,.16);--red:#f39d95;--purple-bg:rgba(150,112,236,.18);--purple:#c5aaf6;--pink-bg:rgba(230,90,160,.16);--pink:#f2a3cb;--teal-bg:rgba(40,180,170,.16);--teal:#7fd6cf}}
*{box-sizing:border-box}
body{margin:0;padding:2px;font:13px/1.5 Inter,"SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;font-feature-settings:"cv11","ss01";-webkit-font-smoothing:antialiased;color:var(--ink);background:transparent}
svg.i{width:15px;height:15px;flex:0 0 15px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.card{background:var(--bg);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);overflow:hidden}
.card+.card{margin-top:8px}
.hd{display:flex;align-items:center;gap:12px;padding:14px 16px}
.hd .grow{flex:1;min-width:0}
.logo{flex:0 0 36px;width:36px;height:36px;border-radius:9px;display:grid;place-items:center;font-weight:600;font-size:14px;letter-spacing:-.01em}
.logo.sm{flex-basis:28px;width:28px;height:28px;border-radius:7px;font-size:12px}
.t0{background:var(--blue-bg);color:var(--blue)}.t1{background:var(--purple-bg);color:var(--purple)}.t2{background:var(--green-bg);color:var(--green)}.t3{background:var(--orange-bg);color:var(--orange)}.t4{background:var(--pink-bg);color:var(--pink)}.t5{background:var(--teal-bg);color:var(--teal)}.t6{background:var(--gray-bg);color:var(--gray)}.t7{background:var(--red-bg);color:var(--red)}
.ttl{margin:0;font-size:14.5px;font-weight:600;letter-spacing:-.012em;line-height:1.35;overflow-wrap:anywhere}
.meta{margin:1px 0 0;color:var(--muted);font-size:12px;display:flex;flex-wrap:wrap;gap:0 6px}
.meta span+span:before{content:"·";margin-right:6px;color:var(--faint)}
.pill{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border:1px solid var(--line-2);border-radius:6px;font-size:12px;font-weight:500;color:var(--ink-2);background:var(--bg);white-space:nowrap}
.dot{width:6px;height:6px;border-radius:50%;background:var(--faint)}
.pill.pending .dot{background:#e8930c}.pill.executed .dot{background:#22a35a}.pill.rejected .dot,.pill.expired .dot{background:var(--faint)}
.props{border-top:1px solid var(--line);padding:6px}
.prop{display:grid;grid-template-columns:minmax(120px,34%) 1fr;align-items:start;gap:8px;min-height:32px;padding:0 10px;border-radius:6px}
.prop:hover{background:var(--hover)}
.pk{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12.5px;padding:7px 0;min-width:0}
.pk span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv{padding:6px 0;font-size:13px;color:var(--ink);overflow-wrap:anywhere;min-width:0;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.empty-v{color:var(--faint)}
.tag{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:4px;font-size:12px;font-weight:500;line-height:20px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;color:var(--muted)}
.num{font-variant-numeric:tabular-nums}
.ft{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px 10px 16px;border-top:1px solid var(--line);background:var(--subtle)}
.hint{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;min-width:0}
.btns{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
button{font:inherit;font-size:13px;font-weight:500;height:30px;padding:0 12px;border-radius:7px;border:1px solid var(--line-2);background:var(--bg);color:var(--ink);cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 1px 1px rgba(16,17,20,.04);transition:background .12s,opacity .12s}
button:hover{background:var(--hover)}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button.primary{background:var(--primary);color:var(--on-primary);border-color:transparent}
button.primary:hover{opacity:.88;background:var(--primary)}
button.ghost{border-color:transparent;background:transparent;box-shadow:none;color:var(--ink-2)}
button.ghost:hover{background:var(--hover)}
button.sm{height:26px;padding:0 9px;font-size:12.5px;border-radius:6px}
button:disabled{opacity:.5;cursor:default}
.banner{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--line);font-size:12.5px;font-weight:500}
.banner.ok{background:var(--green-bg);color:var(--green)}.banner.off{background:var(--subtle);color:var(--muted)}.banner.bad{background:var(--red-bg);color:var(--red)}
.sh{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;color:var(--muted);font-size:12px;font-weight:500;border-bottom:1px solid var(--line)}
.row{display:flex;align-items:center;gap:10px;padding:8px 12px 8px 16px;border-top:1px solid var(--line)}
.sh+.row,.row:first-child{border-top:0}
.row:hover{background:var(--hover)}
.row .grow{flex:1;min-width:0}
.name{font-weight:500;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sub{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .acts{display:flex;gap:4px;align-items:center}
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px;border-top:1px solid var(--line)}
.pair{display:grid;grid-template-columns:1fr auto 1fr;border-top:1px solid var(--line)}
.side{padding:12px 16px;min-width:0}
.vs{display:grid;place-items:center;padding:0 2px;color:var(--faint);font-size:11px;font-weight:600;border-left:1px solid var(--line);border-right:1px solid var(--line);writing-mode:vertical-rl}
.kv{display:flex;gap:6px;font-size:12px;color:var(--muted);margin-top:4px;min-width:0}
.kv b{font-weight:500;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bars{padding:8px 16px 14px;border-top:1px solid var(--line)}
.bar{display:grid;grid-template-columns:minmax(90px,32%) 1fr auto;gap:12px;align-items:center;padding:5px 6px;margin:0 -6px;border-radius:6px;cursor:pointer}
.bar:hover{background:var(--hover)}
.bl{font-size:12.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.track{height:8px;border-radius:4px;background:var(--hover);overflow:hidden}
.fill{height:100%;border-radius:4px;background:var(--accent)}
.bv{font-size:12.5px;font-weight:500;font-variant-numeric:tabular-nums}
.empty{padding:28px 16px;text-align:center;color:var(--muted)}
.err{padding:8px 16px;color:var(--red);font-size:12px;border-top:1px solid var(--line)}
.sk{padding:16px;display:grid;gap:10px}
.sk i{display:block;height:10px;border-radius:5px;background:linear-gradient(90deg,var(--hover),var(--subtle),var(--hover));background-size:200% 100%;animation:sk 1.2s ease-in-out infinite}
@keyframes sk{0%{background-position:100% 0}100%{background-position:-100% 0}}
@media (prefers-reduced-motion:reduce){.sk i{animation:none}}
@media (max-width:420px){.prop{grid-template-columns:1fr;gap:0}.pk{padding-bottom:0}.pair{grid-template-columns:1fr}.vs{writing-mode:horizontal-tb;border:0;border-top:1px solid var(--line);padding:4px}}
`;

// Plain ES5-style script (no template literals) so it can live inside this TS string.
const script = `
var VIEW="__VIEW__",ORIGIN="__ORIGIN__",root=document.getElementById("root");
var state={input:null,result:null,extra:null,done:null,error:""},seq=0,pending={};
var actionLabels={create_record:"Nouvelle fiche",update_record:"Modification de fiche",create_task:"Nouvelle tâche",update_task:"Modification de tâche",create_note:"Nouvelle note privée",update_note:"Modification de note",update_commitment:"Mise à jour d’un engagement",create_workflow_draft:"Brouillon de workflow",update_workflow_draft:"Modification de workflow",add_to_list:"Ajout à une liste",remove_from_list:"Retrait d’une liste",merge_records:"Fusion de doublons",create_attribute:"Nouveau champ",save_pipeline_stages:"Étapes du pipeline"};
var fieldLabels={title:"Titre",description:"Description",due_date:"Échéance",record_id:"Fiche",owner_id:"Responsable",status:"Statut",priority:"Priorité",content:"Contenu",private:"Privée",display_name:"Nom",email:"Email",domain:"Domaine",stage:"Étape",amount:"Montant",currency:"Devise",close_date:"Clôture",probability:"Probabilité",lost_reason:"Raison de perte",attributes:"Champs",object_id:"Type",pipeline_id:"Pipeline",id:"Identifiant",version:"Version",values:"Valeurs",list_id:"Liste",evidence:"Preuve",name:"Nom",definition:"Définition",key:"Clé",type:"Type de champ",required:"Obligatoire",options:"Options",source_id:"Fiche source",target_id:"Fiche conservée",source_version:"Version source",target_version:"Version conservée",choices:"Choix",stages:"Étapes",labels:"Libellés",probabilities:"Probabilités",moves:"Déplacements"};
var fieldIcons={display_name:"text",title:"text",name:"text",email:"mail",domain:"globe",object_id:"shapes",stage:"flag",status:"status",priority:"flag",amount:"money",currency:"money",close_date:"calendar",due_date:"calendar",owner_id:"user",record_id:"link",source_id:"link",target_id:"link",list_id:"list",pipeline_id:"columns",probability:"percent",content:"align",description:"align",lost_reason:"align",evidence:"align",private:"lock",required:"check",version:"hash",source_version:"hash",target_version:"hash",stages:"columns",options:"list",type:"shapes",key:"hash"};
var priorityLabels={low:"Basse",normal:"Normale",high:"Haute",urgent:"Urgente"},taskStatus={open:"À faire",in_progress:"En cours",done:"Terminée",cancelled:"Annulée",confirmed:"Confirmé"};
var statusLabels={pending:"En attente",executed:"Exécutée",rejected:"Annulée",expired:"Expirée"};
var sectionLabels={task:"Tâches",note:"Notes",meeting:"Réunions",email:"Emails",calendar:"Agenda",document:"Documents",commitment:"Engagements",conflict:"Conflits"};
var shapes={text:[["path","M4 4.5h8M8 4.5v8"]],mail:[["rect",2.5,4,11,8,1.5],["path","M3 5l5 3.8L13 5"]],globe:[["circle",8,8,5.5],["path","M2.5 8h11M8 2.5c1.8 2 1.8 9 0 11M8 2.5c-1.8 2-1.8 9 0 11"]],shapes:[["rect",2.5,2.5,5,5,1.2],["circle",11,11,2.6]],flag:[["path","M4 13.5V2.8M4 3.2h7.5L10 5.8l1.5 2.6H4"]],status:[["circle",8,8,5.5],["circle",8,8,1.6]],money:[["path","M8 2.5v11M10.6 5.2c-.4-1-1.3-1.6-2.6-1.6-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.3 0-2.3-.6-2.7-1.7"]],calendar:[["rect",2.5,3.5,11,10,1.5],["path","M2.5 6.8h11M5.5 2v3M10.5 2v3"]],user:[["circle",8,5.8,2.6],["path","M3.3 13.5c.8-2.3 2.6-3.5 4.7-3.5s3.9 1.2 4.7 3.5"]],link:[["path","M6.8 9.2a2.6 2.6 0 003.7 0l2-2a2.6 2.6 0 00-3.7-3.7l-.6.6M9.2 6.8a2.6 2.6 0 00-3.7 0l-2 2a2.6 2.6 0 003.7 3.7l.6-.6"]],list:[["path","M6 4.5h7.5M6 8h7.5M6 11.5h7.5M3 4.5h.01M3 8h.01M3 11.5h.01"]],columns:[["rect",2.5,3,11,10,1.5],["path","M6.2 3v10M9.8 3v10"]],percent:[["path","M12.5 3.5l-9 9"],["circle",4.8,4.8,1.4],["circle",11.2,11.2,1.4]],align:[["path","M3 4.5h10M3 8h10M3 11.5h6"]],lock:[["rect",3.5,7,9,6.5,1.5],["path","M5.5 7V5.3a2.5 2.5 0 015 0V7"]],check:[["path","M3.5 8.4l3 3 6-7"]],x:[["path","M4.5 4.5l7 7M11.5 4.5l-7 7"]],hash:[["path","M6.2 2.8l-1 10.4M10.8 2.8l-1 10.4M3 6.2h10.5M2.5 9.8H13"]],external:[["path","M9 2.8h4.2V7M13 3L7.6 8.4M11.2 9.6v2.6c0 .6-.5 1-1 1H3.8c-.6 0-1-.4-1-1V5.8c0-.6.4-1 1-1h2.6"]],clock:[["circle",8,8,5.5],["path","M8 5v3.2l2.1 1.4"]],sparkle:[["path","M8 2.5l1.3 3.7 3.7 1.3-3.7 1.3L8 12.5l-1.3-3.7L3 7.5l3.7-1.3z"]],search:[["circle",7.2,7.2,4.2],["path","M10.4 10.4l3.1 3.1"]],merge:[["path","M4.5 3v3.2c0 1.8 1.4 3.3 3.3 3.3h3.7M4.5 13V9.8M9.8 7.6l1.9 1.9-1.9 1.9"]],chart:[["path","M3 13h10M5 10.5V8M8 10.5V4.5M11 10.5V6.5"]]};
var NS="http://www.w3.org/2000/svg";
function icon(name){var s=document.createElementNS(NS,"svg");s.setAttribute("viewBox","0 0 16 16");s.setAttribute("class","i");s.setAttribute("aria-hidden","true");(shapes[name]||shapes.hash).forEach(function(p){var e=document.createElementNS(NS,p[0]);if(p[0]==="path")e.setAttribute("d",p[1]);else if(p[0]==="circle"){e.setAttribute("cx",p[1]);e.setAttribute("cy",p[2]);e.setAttribute("r",p[3])}else{e.setAttribute("x",p[1]);e.setAttribute("y",p[2]);e.setAttribute("width",p[3]);e.setAttribute("height",p[4]);e.setAttribute("rx",p[5])}s.appendChild(e)});return s}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=String(text);return e}
function btn(label,cls,fn,ic){var b=el("button",cls);b.type="button";if(ic)b.appendChild(icon(ic));b.appendChild(document.createTextNode(label));b.onclick=function(){fn(b)};return b}
function send(m){window.parent.postMessage(m,"*")}
function rpc(method,params){return new Promise(function(ok,ko){var id=++seq;pending[id]={ok:ok,ko:ko};send({jsonrpc:"2.0",id:id,method:method,params:params||{}});setTimeout(function(){if(pending[id]){delete pending[id];ko(new Error("timeout"))}},20000)})}
function oa(){return window.openai||null}
function openLink(url){if(typeof url!=="string"||url.indexOf(ORIGIN+"/")!==0)return Promise.resolve();if(oa()&&oa().openExternal)return Promise.resolve(oa().openExternal({href:url}));return rpc("ui/open-link",{url:url})}
function say(text){if(oa()&&oa().sendFollowUpMessage)return Promise.resolve(oa().sendFollowUpMessage({prompt:text}));return rpc("ui/message",{role:"user",content:{type:"text",text:text}})}
function callTool(name,args){if(oa()&&oa().callTool)return Promise.resolve(oa().callTool(name,args));return rpc("tools/call",{name:name,arguments:args})}
function structured(r){if(!r)return null;if(r.structuredContent)return r.structuredContent;return r}
function payload(){var s=structured(state.result);return s&&s.data!==undefined?s.data:s}
function money(v,c){var n=Number(v);if(!isFinite(n))return String(v);try{return n.toLocaleString("fr-FR",{style:"currency",currency:c||"EUR",maximumFractionDigits:0})}catch(e){return n.toLocaleString("fr-FR")+" "+(c||"")}}
function day(v){var d=new Date(v);if(isNaN(d.getTime()))return String(v);return d.toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}
function when(v){var d=new Date(v);if(isNaN(d.getTime()))return "";return d.toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
function hash(s){var h=0;s=String(s||"");for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}
function tone(s){return "t"+(hash(s)%6)}
function initials(n){var w=String(n||"?").split(" ").filter(Boolean);return (w.length>1?w[0].charAt(0)+w[1].charAt(0):String(n||"?").slice(0,1)).toUpperCase()||"?"}
function isUuid(v){return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)}
function recordName(r){return r&&(r.display_name||r.name||r.label||r.title)||"Sans nom"}
function zyliadSearch(name){return ORIGIN+"/app/search?q="+encodeURIComponent(name)}
function failure(){state.error="Action impossible pour le moment. Réessayez ou demandez à l’assistant.";render()}
function logo(name,small){return el("div","logo "+(small?"sm ":"")+tone(name),initials(name))}
function tag(text,cls){return el("span","tag "+(cls||tone(text)),text)}
function pill(status){var p=el("span","pill "+status);p.appendChild(el("span","dot"));p.appendChild(document.createTextNode(statusLabels[status]||status));return p}
function header(name,meta,right,lg){var h=el("div","hd");h.appendChild(lg||logo(name));var g=el("div","grow");g.appendChild(el("p","ttl",name));if(meta&&meta.length){var m=el("p","meta");meta.forEach(function(x){if(x)m.appendChild(el("span",null,x))});g.appendChild(m)}h.appendChild(g);if(right)h.appendChild(right);return h}
function fieldLabel(path,labels){if(labels&&path.indexOf("attributes.")===0&&labels[path])return labels[path];var parts=path.split(".");if(parts[0]==="attributes"&&parts[1])return parts[1].charAt(0).toUpperCase()+parts[1].slice(1).split("_").join(" ");if(parts[0]==="values"&&parts[1])return fieldLabels[parts[1]]||parts[1];return fieldLabels[parts[parts.length-1]]||parts[parts.length-1]}
function value(key,v,labels,all){var leaf=key.split(".").pop(),box=document.createDocumentFragment();
 if(labels&&labels[key+"#value"]){box.appendChild(tag(labels[key+"#value"],"t6"));return box}
 if(leaf==="object_id"&&labels&&labels.object_id){box.appendChild(tag(labels.object_id,"t6"));return box}
 if(v===null||v===undefined||v===""){box.appendChild(el("span","empty-v","Vide"));return box}
 if(typeof v==="boolean"){box.appendChild(tag(v?"Oui":"Non",v?"t2":"t6"));return box}
 if(Array.isArray(v)){if(!v.length){box.appendChild(el("span","empty-v","Aucun"));return box}v.slice(0,12).forEach(function(x){box.appendChild(typeof x==="object"?el("span","mono",JSON.stringify(x)):tag(String(x)))});return box}
 if(typeof v==="object"){box.appendChild(el("span","mono",JSON.stringify(v).slice(0,160)));return box}
 if(leaf==="amount"){box.appendChild(el("span","num",money(v,all&&all.currency)));return box}
 if(leaf==="probability"){box.appendChild(el("span","num",v+" %"));return box}
 if(leaf==="close_date"||leaf==="due_date"){box.appendChild(el("span",null,day(v)));return box}
 if(leaf==="priority"){box.appendChild(tag(priorityLabels[v]||v,v==="urgent"||v==="high"?"t7":v==="low"?"t6":"t0"));return box}
 if(leaf==="status"){box.appendChild(tag(taskStatus[v]||v,v==="done"?"t2":v==="in_progress"?"t0":"t6"));return box}
 if(leaf==="stage"||leaf==="type"||leaf==="currency"){box.appendChild(tag(String(v)));return box}
 if(leaf==="version"||leaf==="source_version"||leaf==="target_version"){box.appendChild(el("span","mono","v"+v));return box}
 if(isUuid(v)){box.appendChild(el("span","mono",String(v).slice(0,8)+"…"));return box}
 box.appendChild(document.createTextNode(String(v)));return box}
function flatten(v,prefix,out){if(v&&typeof v==="object"&&!Array.isArray(v)&&(prefix===""||prefix==="attributes"||prefix==="values"||prefix==="values.attributes"||prefix==="choices")){Object.keys(v).forEach(function(k){flatten(v[k],prefix?prefix+"."+k:k,out)})}else out.push([prefix,v]);return out}
function props(rows,labels,all){var box=el("div","props");rows.forEach(function(p){var r=el("div","prop"),k=el("div","pk");k.appendChild(icon(fieldIcons[p[0].split(".").pop()]||(p[0].indexOf("attributes.")===0?"hash":"hash")));k.appendChild(el("span",null,fieldLabel(p[0],labels)));var v=el("div","pv");v.appendChild(value(p[0],p[1],labels,all));r.appendChild(k);r.appendChild(v);box.appendChild(r)});return box}
function footer(hint,buttons){var f=el("div","ft");if(hint){var h=el("div","hint");h.appendChild(icon(hint[0]));h.appendChild(el("span",null,hint[1]));f.appendChild(h)}var b=el("div","btns");buttons.forEach(function(x){b.appendChild(x)});f.appendChild(b);return f}
function banner(cls,ic,text){var b=el("div","banner "+cls);b.appendChild(icon(ic));b.appendChild(el("span",null,text));return b}
function chips(r){var out=[];if(r.stage)out.push(["stage",r.stage]);if(r.amount!=null&&Number(r.amount)!==0)out.push(["amount",r.amount]);if(r.probability!=null)out.push(["probability",r.probability]);if(r.close_date)out.push(["close_date",r.close_date]);if(r.email)out.push(["email",r.email]);if(r.domain)out.push(["domain",r.domain]);if(r.owner_name)out.push(["owner_id",r.owner_name]);return out}
function recordCard(r,extra){var card=el("div","card"),name=recordName(r);card.appendChild(header(name,[r.object_name||r.object||"Fiche",r.updated_at?"Modifiée le "+day(r.updated_at):null,r.version?"v"+r.version:null],null));
 var rows=chips(r);var attrs=r.attributes&&typeof r.attributes==="object"?Object.keys(r.attributes):[];attrs.slice(0,12).forEach(function(k){rows.push(["attributes."+k,r.attributes[k]])});if(rows.length)card.appendChild(props(rows,null,r));
 if(extra&&extra.sections){var s=el("div","chips");Object.keys(extra.sections).forEach(function(k){var d=extra.sections[k]&&extra.sections[k].data;s.appendChild(tag((sectionLabels[k]||k)+" · "+(d?d.length:0),"t6"))});card.appendChild(s)}
 card.appendChild(footer(null,[btn("Contexte","ghost sm",function(b){b.disabled=true;callTool("zyliad_record_context",{record_id:r.id,sections:["task","note","meeting"],limit:3}).then(function(res){var d=structured(res);state.extra=d&&d.data?d.data:d;state.error=res&&res.isError?"Contexte indisponible avec vos permissions actuelles.":"";render()}).catch(failure)},"clock"),btn("Relance","ghost sm",function(){say("Prépare une relance pour la fiche « "+name+" » ("+r.id+").").catch(failure)},"sparkle"),btn("Tâche","ghost sm",function(){say("Propose une tâche de suivi pour la fiche « "+name+" » ("+r.id+").").catch(failure)},"check"),btn("Ouvrir dans Zyliad","primary sm",function(){openLink(zyliadSearch(name)).catch(failure)},"external")]));return card}
function renderRecord(d){var r=d&&(d.record||d);if(!r||!r.id)return empty("Aucune fiche à afficher.");root.appendChild(recordCard(r,state.extra||d))}
function renderResults(d){var rows=(d&&(d.data||d.records))||[];if(!Array.isArray(rows)||!rows.length)return empty("Aucune fiche trouvée dans le périmètre autorisé.");var card=el("div","card"),sh=el("div","sh");sh.appendChild(el("span",null,rows.length+(rows.length>1?" fiches":" fiche")+(d&&d.has_more?" · d’autres résultats existent":"")));card.appendChild(sh);
 rows.slice(0,20).forEach(function(item){var r=item.record||item,row=el("div","row"),name=recordName(r);row.appendChild(logo(name,true));var g=el("div","grow");g.appendChild(el("div","name",name));var sub=[r.amount!=null&&Number(r.amount)!==0?money(r.amount,r.currency):null,r.email||r.domain].filter(Boolean).join(" · ");g.appendChild(el("div","sub",sub||"Fiche CRM"));row.appendChild(g);var a=el("div","acts");if(r.stage)a.appendChild(tag(String(r.stage)));
  a.appendChild(btn("Détails","ghost sm",function(b){b.disabled=true;callTool("zyliad_get_record",{record_id:r.id}).then(function(res){var x=structured(res);var rec=x&&x.data&&x.data.record;if(rec){root.replaceChildren(recordCard(rec))}else{state.error="Fiche inaccessible.";render()}}).catch(failure)}));
  a.appendChild(btn("Choisir","sm",function(b){b.disabled=true;say("Je choisis la fiche « "+name+" » ("+r.id+").").catch(failure)}));row.appendChild(a);card.appendChild(row)});root.appendChild(card)}
function proposalName(action,values,labels){var v=values||{},inner=v.values||{};return v.display_name||v.title||v.name||inner.display_name||inner.title||inner.name||(action==="add_to_list"||action==="remove_from_list"?"Liste":action==="merge_records"?"Deux fiches":actionLabels[action]||"Proposition")}
function renderProposal(d){var input=state.input||{},result=d||{},values=result.values||input.values||{},labels=result.labels||{},status=state.done||result.status||"pending",action=result.action||"";
 if(!action&&input.decision&&!input.values)return renderDecision(result,input);
 var card=el("div","card"),name=proposalName(action,values,labels),meta=[actionLabels[action]||"Proposition",labels.object_id||null];
 card.appendChild(header(name,meta,pill(status),action==="create_record"||action==="update_record"?logo(name):(function(){var l=el("div","logo t6");l.appendChild(icon(action.indexOf("task")>=0?"check":action.indexOf("note")>=0?"align":action.indexOf("list")>=0?"list":action==="merge_records"?"merge":action==="save_pipeline_stages"?"columns":action==="create_attribute"?"hash":"sparkle"));return l})()));
 var rows=flatten(values,"",[]).filter(function(p){var k=p[0].split(".").pop();return p[1]!==undefined&&p[1]!==null&&p[1]!==""&&!(k==="currency"&&values.amount!=null)&&k!=="private"&&!(k==="id"&&action.indexOf("update")===0)});if(rows.length)card.appendChild(props(rows.slice(0,30),labels,values.values||values));
 if(status==="executed")card.appendChild(banner("ok","check","Modification exécutée dans Zyliad."));
 else if(status==="rejected")card.appendChild(banner("off","x","Proposition annulée : rien n’a été modifié."));
 else if(status==="expired")card.appendChild(banner("off","clock","Proposition expirée : demandez-en une nouvelle."));
 if(state.error)card.appendChild(el("div","err",state.error));
 if(status==="pending"&&result.id){var busy=false;var decide=function(decision,b){if(busy)return;busy=true;b.disabled=true;state.error="";callTool("zyliad_confirm_command",{id:result.id,decision:decision}).then(function(res){busy=false;var x=structured(res);var s=x&&x.data&&x.data.status;if(res&&res.isError||!s){state.error=decision==="approve"?"La modification n’a pas pu être exécutée (droits, version ou expiration). Demandez à l’assistant.":"L’annulation n’a pas pu être enregistrée.";render();return}state.done=s;render();say(s==="executed"?"Confirmé : la proposition "+result.id+" est exécutée.":"Annulé : la proposition "+result.id+" est supprimée. Ne la reprends pas.").catch(function(){})}).catch(function(){busy=false;failure()})};
  var bs=[];if(result.confirmation_url)bs.push(btn("Zyliad","ghost",function(){openLink(result.confirmation_url).catch(failure)},"external"));bs.push(btn("Annuler",null,function(b){decide("reject",b)}));bs.push(btn("Confirmer","primary",function(b){decide("approve",b)},"check"));
  card.appendChild(footer(["lock",result.expires_at?"Rien n’est modifié avant votre accord · expire le "+when(result.expires_at):"Rien n’est modifié avant votre accord"],bs))}
 else if(status==="executed"&&(action==="create_record"||action==="update_record"))card.appendChild(footer(null,[btn("Ouvrir dans Zyliad","sm",function(){openLink(zyliadSearch(name)).catch(failure)},"external")]));
 else if(result.id&&status!=="executed"&&status!=="rejected"&&status!=="expired")card.appendChild(footer(null,[btn("Actualiser","ghost sm",function(b){b.disabled=true;callTool("zyliad_command_status",{id:result.id}).then(function(res){var x=structured(res);var s=x&&x.data&&x.data.status;if(s)state.done=s;else state.error="Statut indisponible.";render()}).catch(failure)},"clock")]));
 root.appendChild(card)}
function renderDecision(result,input){var status=state.done||result.status||"pending",card=el("div","card");var l=el("div","logo "+(status==="executed"?"t2":"t6"));l.appendChild(icon(status==="executed"?"check":"x"));card.appendChild(header(status==="executed"?"Proposition confirmée":status==="rejected"?"Proposition annulée":"Proposition",[statusLabels[status]||status],pill(status),l));
 card.appendChild(status==="executed"?banner("ok","check","Modification exécutée dans Zyliad."):status==="rejected"?banner("off","x","Rien n’a été modifié."):banner("off","clock","Vérifiez la proposition avant de réessayer."));root.appendChild(card)}
function side(r){var s=el("div","side"),name=recordName(r),h=el("div","hd");h.style.padding="0 0 6px";h.appendChild(logo(name,true));var g=el("div","grow");g.appendChild(el("div","name",name));g.appendChild(el("div","sub","v"+(r.version||"–")));h.appendChild(g);s.appendChild(h);[["Email",r.email],["Domaine",r.domain],["Étape",r.stage]].forEach(function(p){if(p[1]==null||p[1]==="")return;var kv=el("div","kv");kv.appendChild(el("span",null,p[0]));kv.appendChild(el("b",null,p[1]));s.appendChild(kv)});return s}
function renderDuplicates(d){var inner=d&&d.data&&!Array.isArray(d.data)?d.data:d,pairs=(inner&&inner.data)||[];if(!Array.isArray(pairs)||!pairs.length)return empty("Aucun doublon potentiel détecté.");
 pairs.slice(0,10).forEach(function(p){if(!p.a||!p.b)return;var card=el("div","card"),l=el("div","logo t3");l.appendChild(icon("merge"));card.appendChild(header("Doublon probable",[recordName(p.a)+" et "+recordName(p.b)],null,l));var pair=el("div","pair");pair.appendChild(side(p.a));pair.appendChild(el("div","vs","OU"));pair.appendChild(side(p.b));card.appendChild(pair);
  card.appendChild(footer(null,[btn("Pas des doublons","ghost sm",function(b){b.disabled=true;say("« "+recordName(p.a)+" » et « "+recordName(p.b)+" » ne sont pas des doublons.").catch(failure)}),btn("Garder la 1re","sm",function(){say("Propose la fusion de « "+recordName(p.b)+" » ("+p.b.id+", version "+p.b.version+") dans « "+recordName(p.a)+" » ("+p.a.id+", version "+p.a.version+").").catch(failure)}),btn("Garder la 2de","primary sm",function(){say("Propose la fusion de « "+recordName(p.a)+" » ("+p.a.id+", version "+p.a.version+") dans « "+recordName(p.b)+" » ("+p.b.id+", version "+p.b.version+").").catch(failure)},"merge")]));root.appendChild(card)})}
function metric(row){var keys=["sum","total","amount","count","value","average","avg"];for(var i=0;i<keys.length;i++){if(row[keys[i]]!=null&&isFinite(Number(row[keys[i]])))return {key:keys[i],value:Number(row[keys[i]])}}for(var k in row){if(k!=="dimension"&&isFinite(Number(row[k]))&&typeof row[k]!=="boolean")return {key:k,value:Number(row[k])}}return null}
function renderPipeline(d){var rows=(d&&d.data)||[];if(!Array.isArray(rows)||!rows.length)return empty("Aucune donnée à représenter.");var card=el("div","card"),max=0,total=0,items=rows.slice(0,30).map(function(r){var m=metric(r)||{key:"",value:0};max=Math.max(max,m.value);total+=m.value;return {label:r.dimension==null?"(vide)":String(r.dimension)+(r.currency?" · "+r.currency:""),m:m,raw:r}});
 var count=items.length&&items[0].m.key==="count",l=el("div","logo t0");l.appendChild(icon("chart"));card.appendChild(header("Répartition",[items.length+" groupes",count?total.toLocaleString("fr-FR")+" au total":null],null,l));var bars=el("div","bars");
 items.forEach(function(it){var bar=el("div","bar");bar.title="Analyser ce groupe";bar.appendChild(el("div","bl",it.label));var tr=el("div","track"),f=el("div","fill");f.style.width=(max?Math.max(2,Math.round(it.m.value/max*100)):0)+"%";tr.appendChild(f);bar.appendChild(tr);bar.appendChild(el("div","bv",it.m.key==="count"?it.m.value.toLocaleString("fr-FR"):money(it.m.value,it.raw.currency)));bar.onclick=function(){say("Analyse le groupe « "+it.label+" » de cet agrégat.").catch(failure)};bars.appendChild(bar)});card.appendChild(bars);
 if(d.partial)card.appendChild(banner("off","clock","Résultat partiel : précisez les filtres."));root.appendChild(card)}
function empty(text){var c=el("div","card");c.appendChild(el("div","empty",text));root.appendChild(c)}
function skeleton(){var c=el("div","card"),s=el("div","sk");[60,90,75].forEach(function(w){var i=el("i");i.style.width=w+"%";s.appendChild(i)});c.appendChild(s);root.appendChild(c)}
function render(){root.replaceChildren();var d=payload();if(!state.result&&!state.input){skeleton();return}
 if(state.result&&state.result.isError){var c=el("div","card");c.appendChild(banner("bad","x","Cette action n’a pas abouti. L’assistant vous indique la raison."));root.appendChild(c);return}
 if(!state.result&&VIEW!=="proposal"){skeleton();return}
 try{({record:renderRecord,results:renderResults,proposal:renderProposal,duplicates:renderDuplicates,pipeline:renderPipeline})[VIEW](d)}catch(e){empty("Affichage indisponible pour ce résultat.")}
 if(state.error&&VIEW!=="proposal"){var er=el("div","card");er.appendChild(el("div","err",state.error));root.appendChild(er)}}
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
rpc("ui/initialize",{appInfo:{name:"Zyliad",version:"1.4.1"},appCapabilities:{},protocolVersion:"2026-01-26"}).then(function(r){theme(r&&r.hostContext&&r.hostContext.theme);send({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}})}).catch(function(){});
if(window.ResizeObserver)new ResizeObserver(function(){var h=Math.ceil(document.body.getBoundingClientRect().height);send({jsonrpc:"2.0",method:"ui/notifications/size-changed",params:{width:document.documentElement.scrollWidth,height:h}});if(oa()&&oa().notifyIntrinsicHeight)oa().notifyIntrinsicHeight(h)}).observe(document.body);
`;

/** Self-contained HTML document for one view. */
export function widgetHtml(view: AppView, origin: string) {
  const safeOrigin = JSON.stringify(origin).slice(1, -1).replace(/</g, "\\u003c");
  const body = script.replace("__VIEW__", view).replace("__ORIGIN__", safeOrigin);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zyliad</title><style>${css}</style></head><body><div id="root" role="region" aria-label="Zyliad"></div><script>${body}</script></body></html>`;
}
