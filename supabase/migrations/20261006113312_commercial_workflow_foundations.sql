-- Additive CRM capabilities. Existing data and permissions remain in place.
create table public.pipelines (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 120),
 probabilities jsonb not null default '{"Nouveau":10,"Qualification":25,"Proposition":50,"Négociation":75,"Gagné":100,"Perdu":0}',
 labels jsonb not null default '{}',
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,name),
 check(jsonb_typeof(probabilities)='object' and jsonb_typeof(labels)='object')
);
create index pipelines_workspace_idx on public.pipelines(workspace_id,created_at,id);
create table public.email_templates (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),
 subject text not null check(length(subject) between 1 and 300), body text not null check(length(body) between 1 and 20000),
 version integer not null default 1, created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,id)
);
create index email_templates_workspace_idx on public.email_templates(workspace_id,created_at,id);
create table public.import_jobs (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 object_id uuid not null,created_by uuid not null default auth.uid(),filename text not null check(length(filename)<=255),
 digest text not null check(digest ~ '^[a-f0-9]{64}$'),mapping jsonb not null default '{}',
 inserted integer not null check(inserted>=0),skipped integer not null check(skipped>=0),errors jsonb not null default '[]',
 created_at timestamptz not null default now(),
 foreign key(workspace_id,object_id) references public.objects(workspace_id,id),
 unique(workspace_id,object_id,digest)
);
create index import_jobs_workspace_idx on public.import_jobs(workspace_id,created_at desc);
alter table public.records add column pipeline_id uuid, add column probability numeric(5,2) check(probability between 0 and 100),add column lost_reason text check(length(lost_reason)<=2000);
alter table public.records add constraint records_pipeline_fk foreign key(workspace_id,pipeline_id) references public.pipelines(workspace_id,id);
create index records_pipeline_idx on public.records(workspace_id,pipeline_id,stage) where not archived;
-- RLS policies cover both reads and writes through API or direct Data API access.
alter table public.pipelines enable row level security;
alter table public.email_templates enable row level security;
alter table public.import_jobs enable row level security;
create policy pipelines_read on public.pipelines for select to authenticated using(relay_private.has_role(workspace_id));
create policy pipelines_insert on public.pipelines for insert to authenticated with check(relay_private.has_role(workspace_id,array['owner','admin']));
create policy pipelines_update on public.pipelines for update to authenticated using(relay_private.has_role(workspace_id,array['owner','admin'])) with check(relay_private.has_role(workspace_id,array['owner','admin']));
create policy pipelines_delete on public.pipelines for delete to authenticated using(relay_private.has_role(workspace_id,array['owner','admin']));
create policy templates_read on public.email_templates for select to authenticated using(relay_private.has_role(workspace_id));
create policy templates_insert on public.email_templates for insert to authenticated with check(relay_private.has_role(workspace_id,array['owner','admin','member']));
create policy templates_update on public.email_templates for update to authenticated using(relay_private.has_role(workspace_id,array['owner','admin','member'])) with check(relay_private.has_role(workspace_id,array['owner','admin','member']));
create policy templates_delete on public.email_templates for delete to authenticated using(relay_private.has_role(workspace_id,array['owner','admin','member']));
create policy imports_read on public.import_jobs for select to authenticated using(relay_private.has_role(workspace_id));
create policy imports_insert on public.import_jobs for insert to authenticated with check(relay_private.has_role(workspace_id,array['owner','admin','member']) and created_by=(select auth.uid()));
grant select,insert,update,delete on public.pipelines,public.email_templates to authenticated;
grant select,insert on public.import_jobs to authenticated;
revoke all on public.pipelines,public.email_templates,public.import_jobs from anon;
create trigger touch_version before update on public.pipelines for each row execute function relay_private.touch_version();
create trigger touch_version before update on public.email_templates for each row execute function relay_private.touch_version();
create trigger audit after insert or update or delete on public.pipelines for each row execute function relay_private.audit_change();
create trigger audit after insert or update or delete on public.email_templates for each row execute function relay_private.audit_change();

create function relay_private.validate_pipeline() returns trigger language plpgsql security invoker set search_path='' as $$
declare key text;val jsonb;begin
 if (select count(*) from jsonb_object_keys(new.probabilities))<>6 then raise exception 'Six probabilités sont requises.';end if;
 foreach key in array array['Nouveau','Qualification','Proposition','Négociation','Gagné','Perdu'] loop
  val:=new.probabilities->key;
  if val is null or jsonb_typeof(val)<>'number' or val::numeric not between 0 and 100 then raise exception 'Probabilité invalide.';end if;
 end loop;
 if (new.probabilities->>'Gagné')::numeric<>100 or (new.probabilities->>'Perdu')::numeric<>0 then raise exception 'Étapes terminales invalides.';end if;
 for key,val in select * from jsonb_each(new.labels) loop
  if not key=any(array['Nouveau','Qualification','Proposition','Négociation','Gagné','Perdu']) or jsonb_typeof(val)<>'string' or length(trim(val#>>'{}')) not between 1 and 80 then raise exception 'Libellé invalide.';end if;
 end loop;
 return new;
end $$;
revoke all on function relay_private.validate_pipeline() from public,anon,authenticated;
create trigger validate_pipeline before insert or update on public.pipelines for each row execute function relay_private.validate_pipeline();
insert into public.pipelines(workspace_id,name) select id,'Pipeline principal' from public.workspaces;
update public.records r set pipeline_id=p.id from public.pipelines p,public.objects o where r.workspace_id=p.workspace_id and r.object_id=o.id and o.slug='deals';
create function relay_private.seed_pipeline() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if new.role='owner' and not exists(select 1 from public.pipelines where workspace_id=new.workspace_id) then insert into public.pipelines(workspace_id,name) values(new.workspace_id,'Pipeline principal');end if;return new;end $$;
revoke all on function relay_private.seed_pipeline() from public,anon,authenticated;
create trigger seed_pipeline after insert on public.memberships for each row execute function relay_private.seed_pipeline();
create function relay_private.record_sales_fields() returns trigger language plpgsql security invoker set search_path='' as $$
declare deal boolean;begin
 select slug='deals' into deal from public.objects where workspace_id=new.workspace_id and id=new.object_id;
 if deal then
  if new.pipeline_id is null then select id into new.pipeline_id from public.pipelines where workspace_id=new.workspace_id order by created_at,id limit 1;end if;
  if new.pipeline_id is null then raise exception 'Un pipeline est requis.';end if;
 else
  if new.pipeline_id is not null or new.probability is not null then raise exception 'Champs réservés aux opportunités.';end if;
 end if;
 return new;
end $$;
revoke all on function relay_private.record_sales_fields() from public,anon,authenticated;
create trigger record_sales_fields before insert or update on public.records for each row execute function relay_private.record_sales_fields();

alter table public.notes add column search_index tsvector generated always as (to_tsvector('simple',coalesce(title,'')||' '||content)) stored;
alter table public.tasks add column search_index tsvector generated always as (to_tsvector('simple',title||' '||coalesce(description,''))) stored;
alter table public.commitments add column search_index tsvector generated always as (to_tsvector('simple',title||' '||coalesce(source_quote,''))) stored;
alter table public.meetings add column search_index tsvector generated always as (to_tsvector('simple',title||' '||coalesce(summary,''))) stored;
create index notes_global_search_idx on public.notes using gin(search_index);
create index tasks_global_search_idx on public.tasks using gin(search_index);
create index commitments_global_search_idx on public.commitments using gin(search_index);
create index meetings_global_search_idx on public.meetings using gin(search_index);

-- An import is atomic and idempotent; no record is written during preview.
create function public.import_crm_records(w uuid,obj uuid,rows_data jsonb,file_digest text,file_name text,column_mapping jsonb,duplicate_policy text,error_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.import_jobs;item jsonb;kind text;n integer:=0;s integer:=0;key text;job public.import_jobs;begin
 if not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Accès refusé.' using errcode='42501';end if;
 if jsonb_typeof(rows_data)<>'array' or jsonb_array_length(rows_data)>1000 or jsonb_typeof(error_rows)<>'array' or jsonb_array_length(error_rows)>1000 or duplicate_policy not in ('skip','create') then raise exception 'Import invalide.';end if;
 select slug into kind from public.objects where workspace_id=w and id=obj;
 if kind is null then raise exception 'Objet inaccessible.';end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text||obj::text,0));
 select * into previous from public.import_jobs where workspace_id=w and object_id=obj and digest=file_digest;
 if found then return to_jsonb(previous)||jsonb_build_object('replayed',true);end if;
 for item in select value from jsonb_array_elements(rows_data) loop
  key:=case when kind='people' then lower(nullif(trim(item->>'email'),'')) when kind='companies' then lower(nullif(trim(item->>'domain'),'')) end;
  if duplicate_policy='skip' and key is not null and exists(select 1 from public.records r where r.workspace_id=w and r.object_id=obj and not r.archived and case when kind='people' then lower(r.email) else lower(r.domain) end=key) then s:=s+1;continue;end if;
  insert into public.records(workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,close_date,attributes,pipeline_id,probability,lost_reason)
  values(w,obj,item->>'display_name',nullif(item->>'email',''),nullif(item->>'domain',''),coalesce(item->>'stage','Nouveau'),coalesce((item->>'amount')::numeric,0),coalesce(item->>'currency','EUR'),(item->>'owner_id')::uuid,(item->>'close_date')::date,coalesce(item->'attributes','{}'),(item->>'pipeline_id')::uuid,(item->>'probability')::numeric,nullif(item->>'lost_reason',''));
  n:=n+1;
 end loop;
 insert into public.import_jobs(workspace_id,object_id,filename,digest,mapping,inserted,skipped,errors) values(w,obj,file_name,file_digest,column_mapping,n,s,error_rows) returning * into job;
 return to_jsonb(job)||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.import_crm_records(uuid,uuid,jsonb,text,text,jsonb,text,jsonb) from public,anon;
grant execute on function public.import_crm_records(uuid,uuid,jsonb,text,text,jsonb,text,jsonb) to authenticated;
