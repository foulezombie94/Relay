import type { Condition, CrmRecord, Simulation, Workflow } from './types';
export function valueOf(record:CrmRecord,field:string):unknown {return field.startsWith('attributes.')?record.attributes[field.slice(11)]:record[field];}
export function matches(record:CrmRecord,conditions:Condition[]):boolean {return conditions.every(c=>{const v=valueOf(record,c.field);switch(c.operator){case 'exists':return v!==null&&v!==undefined&&v!=='';case 'equals':return String(v??'')===String(c.value??'');case 'contains':return String(v??'').toLocaleLowerCase().includes(String(c.value??'').toLocaleLowerCase());case 'gt':return Number(v)>Number(c.value);case 'lt':return Number(v)<Number(c.value);}});}
export function simulate(workflow:Workflow,records:CrmRecord[],now=new Date()):Simulation {
  const warnings=new Set<string>();
  const eligible=records.filter(r=>!r.archived&&r.object_id===workflow.definition.object_id&&matches(r,workflow.definition.conditions));
  const recipients=new Set<string>();
  return {workflow_id:workflow.id,workflow_version:workflow.version,created_at:now.toISOString(),records:eligible.map(r=>({id:r.id,version:r.version,display_name:r.display_name,changes:workflow.definition.actions.map(a=>{
    if(a.type==='task'){const due=new Date(now);due.setUTCDate(due.getUTCDate()+(a.days??1));return {type:'task',title:a.title??'Suivre le client',due_date:due.toISOString(),description:`Créer une tâche : ${a.title??'Suivre le client'}`};}
    if(a.type==='set_field')return {type:'set_field',field:a.field,value:a.value,description:`Modifier ${a.field} → ${a.value}`};
    const recipient=r.email??'';if(!recipient)warnings.add(`Adresse manquante : ${r.display_name}`);if(recipients.has(recipient))warnings.add(`Destinataire répété : ${recipient}`);recipients.add(recipient);warnings.add('Les emails nécessitent une connexion d’envoi et ne seront pas envoyés par une simulation.');return {type:'email',recipient,body:a.body,description:`Préparer un email pour ${recipient||r.display_name}`};
  })})),warnings:[...warnings]};
}
