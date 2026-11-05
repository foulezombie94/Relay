-- Automatic enrichment. Companies: public website metadata (and, for French
-- companies, the public business registry). People: association with the
-- company of their professional email domain. Results live beside the record
-- so enrichment never bumps the record version or races a user edit.
begin;
set local lock_timeout='5s';

alter table public.workspaces add column auto_enrich boolean not null default true;

create table public.record_enrichments(
 record_id uuid primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','running','done','failed','skipped')),
 data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object' and octet_length(data::text)<=20000),
 sources text[] not null default '{}',
 error text check(error is null or length(error)<=300),
 attempts integer not null default 0,
 requested_at timestamptz not null default now(), enriched_at timestamptz,
 next_at timestamptz not null default now(),
 lease_owner text, lease_expires_at timestamptz,
 foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade
);
create index record_enrichments_due_idx on public.record_enrichments(next_at) where status in ('pending','failed');
create index record_enrichments_lease_idx on public.record_enrichments(lease_expires_at) where status='running';
alter table public.record_enrichments enable row level security;
create policy record_enrichments_read on public.record_enrichments for select to authenticated using(
 workspace_id in (select relay_private.member_workspaces())
 and (not relay_private.reader_limited(workspace_id) or relay_private.reader_record_allowed(workspace_id,record_id)));
revoke all on public.record_enrichments from public,anon,authenticated;
grant select on public.record_enrichments to authenticated;

create function relay_private.enrichment_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare slug text;
begin
 if new.archived or new.merged_into is not null then return null;end if;
 if tg_op='UPDATE' and new.domain is not distinct from old.domain and new.email is not distinct from old.email then return null;end if;
 if not exists(select 1 from public.workspaces where id=new.workspace_id and auto_enrich) then return null;end if;
 select o.slug into slug from public.objects o where o.workspace_id=new.workspace_id and o.id=new.object_id;
 if not ((slug='companies' and new.domain is not null) or (slug='people' and new.email is not null)) then return null;end if;
 insert into public.record_enrichments(record_id,workspace_id,status,attempts,next_at,requested_at)
 values(new.id,new.workspace_id,'pending',0,now(),now())
 on conflict(record_id) do update set status='pending',attempts=0,next_at=now(),requested_at=now(),error=null
  where public.record_enrichments.status<>'running';
 return null;
end $$;
revoke all on function relay_private.enrichment_enqueue() from public,anon,authenticated;
create trigger enrichment_enqueue after insert or update of domain,email on public.records for each row execute function relay_private.enrichment_enqueue();

-- Manual refresh from the record page.
create function public.request_enrichment(w uuid,rec uuid) returns text
language plpgsql security definer set search_path='' as $$
declare r public.records;slug text;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.records where workspace_id=w and id=rec and not archived and merged_into is null;
 if r.id is null or not relay_private.reader_record_allowed(w,rec) then raise exception 'Relay: Fiche inaccessible.' using errcode='22023';end if;
 select o.slug into slug from public.objects o where o.workspace_id=w and o.id=r.object_id;
 if not ((slug='companies' and r.domain is not null) or (slug='people' and r.email is not null)) then
  raise exception 'Relay: Renseignez le domaine (entreprise) ou l’email (personne) pour enrichir cette fiche.' using errcode='22023';end if;
 if exists(select 1 from public.record_enrichments where record_id=rec and requested_at>now()-interval '1 minute' and status in ('pending','running')) then return 'pending';end if;
 insert into public.record_enrichments(record_id,workspace_id,status,attempts,next_at,requested_at) values(rec,w,'pending',0,now(),now())
 on conflict(record_id) do update set status='pending',attempts=0,next_at=now(),requested_at=now(),error=null where public.record_enrichments.status<>'running';
 return 'pending';
end $$;
revoke all on function public.request_enrichment(uuid,uuid) from public,anon;
grant execute on function public.request_enrichment(uuid,uuid) to authenticated;

-- Worker: claim with a 3-minute lease.
create function relay_private.enrichment_claim(worker text,batch integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update public.record_enrichments set status='failed',lease_owner=null,lease_expires_at=null,error='Traitement interrompu',next_at=now()+interval '5 minutes'
  where status='running' and lease_expires_at<now();
 with picked as(
  select e.record_id from public.record_enrichments e join public.workspaces ws on ws.id=e.workspace_id
  where e.status in ('pending','failed') and e.next_at<=now() and e.attempts<3
  order by e.next_at limit least(greatest(batch,1),50) for update of e skip locked
 ), claimed as(
  update public.record_enrichments e set status='running',lease_owner=worker,lease_expires_at=now()+interval '3 minutes',attempts=e.attempts+1
  from picked where e.record_id=picked.record_id returning e.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('record_id',r.id,'workspace_id',r.workspace_id,'kind',o.slug,'display_name',r.display_name,'domain',r.domain,'email',r.email)),'[]'::jsonb)
 into result from claimed c join public.records r on r.id=c.record_id join public.objects o on o.id=r.object_id;
 return result;
end $$;
create function relay_private.enrichment_complete(rec uuid,worker text,outcome text,result jsonb,origin text[],error_text text) returns text
language plpgsql security definer set search_path='' as $$
declare e public.record_enrichments;r public.records;companies uuid;company uuid;company_domain text;owner uuid;
begin
 select * into e from public.record_enrichments where record_id=rec for update;
 if e.record_id is null or e.status<>'running' or e.lease_owner is distinct from worker then return 'lease_lost';end if;
 if outcome not in ('done','failed','skipped') then raise exception 'Invalid outcome' using errcode='22023';end if;
 if outcome='failed' then
  update public.record_enrichments set status='failed',error=left(error_text,300),lease_owner=null,lease_expires_at=null,
   next_at=now()+make_interval(mins=>15*power(4,greatest(e.attempts-1,0))::integer) where record_id=rec;
  return 'failed';
 end if;
 select * into r from public.records where id=rec;
 company_domain:=lower(nullif(result->>'company_domain',''));
 -- A person is linked to (or creates) the company of their professional domain.
 if outcome='done' and company_domain is not null and company_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$' and not r.archived then
  select id into companies from public.objects where workspace_id=r.workspace_id and slug='companies';
  if companies is not null and not exists(select 1 from public.attributes where workspace_id=r.workspace_id and object_id=companies and required and not archived and type<>'formula') then
   select id into company from public.records where workspace_id=r.workspace_id and object_id=companies and lower(domain)=company_domain and merged_into is null order by archived,created_at limit 1;
   if company is null then
    owner:=r.owner_id;
    insert into public.records(workspace_id,object_id,display_name,domain,owner_id)
    values(r.workspace_id,companies,left(coalesce(nullif(result->>'company_name',''),initcap(replace(split_part(company_domain,'.',1),'-',' '))),200),company_domain,owner)
    returning id into company;
   end if;
   if not exists(select 1 from public.record_relations where workspace_id=r.workspace_id and source_id=rec and target_id=company) then
    insert into public.record_relations(workspace_id,source_id,target_id,label) values(r.workspace_id,rec,company,'Travaille chez') on conflict do nothing;
   end if;
   result:=result||jsonb_build_object('company_id',company);
  end if;
 end if;
 update public.record_enrichments set status=outcome,data=coalesce(result,'{}'::jsonb),sources=coalesce(origin,'{}'),error=null,
  enriched_at=now(),lease_owner=null,lease_expires_at=null where record_id=rec;
 return outcome;
end $$;
create function public.enrichment_claim(worker text,batch integer default 10) returns jsonb language sql security invoker set search_path='' as $$ select relay_private.enrichment_claim(worker,batch) $$;
create function public.enrichment_complete(rec uuid,worker text,outcome text,result jsonb,origin text[],error_text text) returns text language sql security invoker set search_path='' as $$ select relay_private.enrichment_complete(rec,worker,outcome,result,origin,error_text) $$;
revoke all on function relay_private.enrichment_claim(text,integer),relay_private.enrichment_complete(uuid,text,text,jsonb,text[],text),
 public.enrichment_claim(text,integer),public.enrichment_complete(uuid,text,text,jsonb,text[],text) from public,anon,authenticated;
grant execute on function relay_private.enrichment_claim(text,integer),relay_private.enrichment_complete(uuid,text,text,jsonb,text[],text),
 public.enrichment_claim(text,integer),public.enrichment_complete(uuid,text,text,jsonb,text[],text) to service_role;

commit;
