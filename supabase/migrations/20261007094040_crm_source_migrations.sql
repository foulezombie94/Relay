begin;
set local lock_timeout='5s';
create table relay_private.crm_import_keys (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 source text not null check(length(source) between 3 and 100),
 object_id uuid not null, external_id text not null check(length(external_id) between 1 and 200),
 record_id uuid not null,
 primary key(workspace_id,source,object_id,external_id),
 foreign key(workspace_id,object_id) references public.objects(workspace_id,id) on delete cascade,
 foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade
);
create index crm_import_keys_record_idx on relay_private.crm_import_keys(workspace_id,record_id);
create table relay_private.crm_import_links (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 source text not null, record_id uuid not null, target_kind text not null check(target_kind in ('companies','people')),
 external_id text not null check(length(external_id) between 1 and 200),
 primary key(workspace_id,source,record_id,target_kind,external_id),
 foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade
);
alter table relay_private.crm_import_keys enable row level security;
alter table relay_private.crm_import_links enable row level security;
revoke all on relay_private.crm_import_keys,relay_private.crm_import_links from public,anon,authenticated,service_role;
alter table public.import_jobs add column linked integer not null default 0 check(linked>=0),add column pending integer not null default 0 check(pending>=0);
create or replace function relay_private.import_records_v1(w uuid,obj uuid,rows_data jsonb,file_digest text,file_name text,column_mapping jsonb,duplicate_policy text,error_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.import_jobs;item jsonb;kind text;n integer:=0;s integer:=0;key text;job public.import_jobs;
 rid uuid;meta jsonb;scope text;batch_scope text;ext text;ref jsonb;target text;linked_count integer:=0;pending_count integer:=0;candidate_count integer;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(rows_data)<>'array' or jsonb_array_length(rows_data)>1000 or jsonb_typeof(error_rows)<>'array' or jsonb_array_length(error_rows)>1000 or duplicate_policy not in ('skip','create') then raise exception 'Invalid import' using errcode='22023';end if;
 select slug into kind from public.objects where workspace_id=w and id=obj;
 if kind is null then raise exception 'Object inaccessible' using errcode='42501';end if;
 -- A single tenant lock serializes source mapping, duplicate checks and relation resolution.
 perform pg_advisory_xact_lock(hashtextextended('crm-migration:'||w::text,0));
 perform pg_advisory_xact_lock(hashtextextended(w::text||obj::text,0));
 select * into previous from public.import_jobs where workspace_id=w and object_id=obj and digest=file_digest;
 if found then return to_jsonb(previous)||jsonb_build_object('replayed',true);end if;
 for item in select value from jsonb_array_elements(rows_data) loop
  rid:=null;meta:=item->'_import';scope:=null;ext:=null;
  if meta is not null then
   scope:=meta->>'source';ext:=meta->>'id';
   if jsonb_typeof(meta)<>'object' or coalesce(scope,'')!~'^(attio|pipedrive|close|hubspot|freshsales|copper|zoho|folk|monday|file):.+'
    or length(scope)>100 or scope ~ '[[:cntrl:]]' or coalesce(length(ext),0) not between 1 and 200 or ext ~ '[[:cntrl:]]'
    or jsonb_typeof(meta->'id')<>'string' or jsonb_typeof(meta->'source')<>'string' then raise exception 'Invalid source identifiers' using errcode='22023';end if;
   if batch_scope is not null and batch_scope<>scope then raise exception 'Mixed import sources' using errcode='22023';end if;
   batch_scope:=scope;
   for target in select unnest(array['companies','people']) loop
    if meta ? target then
     if jsonb_typeof(meta->target)<>'array' then raise exception 'Invalid associations' using errcode='22023';end if;
     if jsonb_array_length(meta->target)>20 or exists(select 1 from jsonb_array_elements(meta->target) v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 200 or (v#>>'{}')~'[[:cntrl:]]') then raise exception 'Invalid associations' using errcode='22023';end if;
    end if;
   end loop;
   select k.record_id into rid from relay_private.crm_import_keys k join public.records r on r.id=k.record_id and r.workspace_id=k.workspace_id
   where k.workspace_id=w and k.source=scope and k.object_id=obj and k.external_id=ext and not r.archived and r.merged_into is null;
   -- Source identity is authoritative: re-imports never create or rewrite the same source record.
   if rid is not null then s:=s+1;end if;
  end if;
  key:=case when kind='people' then lower(nullif(trim(item->>'email'),'')) when kind='companies' then lower(nullif(trim(item->>'domain'),'')) end;
  if rid is null and duplicate_policy='skip' and key is not null then
   select count(*),(array_agg(r.id order by r.id))[1] into candidate_count,rid from public.records r where r.workspace_id=w and r.object_id=obj and not r.archived and r.merged_into is null and case when kind='people' then lower(r.email) else lower(r.domain) end=key;
   if candidate_count>1 and meta is not null then raise exception 'Plusieurs fiches existantes partagent cet email ou domaine. Fusionnez les doublons avant la migration.' using errcode='22023';end if;
   if rid is not null then s:=s+1;end if;
  end if;
  if rid is null then
   insert into public.records(workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,close_date,attributes,pipeline_id,probability,lost_reason)
   values(w,obj,item->>'display_name',nullif(item->>'email',''),nullif(item->>'domain',''),coalesce(item->>'stage','Nouveau'),coalesce((item->>'amount')::numeric,0),coalesce(item->>'currency','EUR'),(item->>'owner_id')::uuid,(item->>'close_date')::date,coalesce(item->'attributes','{}'),(item->>'pipeline_id')::uuid,(item->>'probability')::numeric,nullif(item->>'lost_reason','')) returning id into rid;
   n:=n+1;
  end if;
  if meta is not null then
   insert into relay_private.crm_import_keys(workspace_id,source,object_id,external_id,record_id) values(w,scope,obj,ext,rid)
    on conflict(workspace_id,source,object_id,external_id) do update set record_id=excluded.record_id;
   for target in select unnest(array['companies','people']) loop
    for ref in select value from jsonb_array_elements(coalesce(meta->target,'[]')) loop
     insert into relay_private.crm_import_links(workspace_id,source,record_id,target_kind,external_id) values(w,scope,rid,target,ref#>>'{}') on conflict do nothing;
    end loop;
   end loop;
  end if;
 end loop;
 if batch_scope is not null then
  -- Only exact source IDs in the same tenant and migration lot can create a relation.
  with resolved as (
   select l.record_id,k.record_id as target_id,case l.target_kind when 'companies' then 'Entreprise' else 'Contact' end as label
   from relay_private.crm_import_links l join public.objects o on o.workspace_id=l.workspace_id and o.slug=l.target_kind
   join relay_private.crm_import_keys k on k.workspace_id=l.workspace_id and k.source=l.source and k.object_id=o.id and k.external_id=l.external_id
   join public.records r on r.workspace_id=k.workspace_id and r.id=k.record_id and not r.archived and r.merged_into is null
   join public.records original on original.workspace_id=l.workspace_id and original.id=l.record_id and not original.archived and original.merged_into is null
   where l.workspace_id=w and l.source=batch_scope and l.record_id<>k.record_id
  ), inserted as (
   insert into public.record_relations(workspace_id,source_id,target_id,label) select distinct w,c.record_id,c.target_id,c.label from resolved c
    where not exists(select 1 from public.record_relations rr where rr.workspace_id=w and ((rr.source_id=c.record_id and rr.target_id=c.target_id) or (rr.source_id=c.target_id and rr.target_id=c.record_id)))
    on conflict do nothing returning id
  ) select count(*) into linked_count from inserted;
  delete from relay_private.crm_import_links l using public.objects o,relay_private.crm_import_keys k,public.records r
   where l.workspace_id=w and l.source=batch_scope and o.workspace_id=w and o.slug=l.target_kind and k.workspace_id=w and k.source=l.source and k.object_id=o.id and k.external_id=l.external_id and r.workspace_id=w and r.id=k.record_id and not r.archived and r.merged_into is null;
  select count(*) into pending_count from relay_private.crm_import_links where workspace_id=w and source=batch_scope;
  if (select count(*) from relay_private.crm_import_links where workspace_id=w)>10000 then raise exception 'Trop de relations en attente. Importez les fiches cibles avant de continuer.' using errcode='53300';end if;
 end if;
 insert into public.import_jobs(workspace_id,object_id,filename,digest,mapping,inserted,skipped,errors,linked,pending) values(w,obj,file_name,file_digest,column_mapping,n,s,error_rows,linked_count,pending_count) returning * into job;
 return to_jsonb(job)||jsonb_build_object('replayed',false);
end $$;
revoke all on function relay_private.import_records_v1(uuid,uuid,jsonb,text,text,jsonb,text,jsonb) from public,anon,authenticated,service_role;
-- Preserve all existing admission checks and worker compatibility; extend the returned summary only.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.import_crm_records(uuid,uuid,jsonb,text,text,jsonb,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'''replayed'',output->''replayed'')','''replayed'',output->''replayed'',''linked'',output->''linked'',''pending'',output->''pending'')');
 execute definition;
end $migration$;
commit;
