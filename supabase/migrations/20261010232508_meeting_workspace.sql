begin;
alter table public.communications add column join_url text not null default '',add column location text not null default '',
 add constraint communication_conference_bounds check(length(location)<=300 and length(join_url)<=2048 and (join_url='' or join_url ~ '^https://(meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|([a-zA-Z0-9-]+\.)*zoom\.us)(/|$)'));
-- Extend the existing lease-checked sync, preserving account, OAuth and tenant guards.
do $$declare definition text;begin
 definition:=pg_get_functiondef('relay_private.connector_sync(uuid,text,text,jsonb)'::regprocedure);
 if position('internet_message_id,attachments)' in definition)=0 or position('attachments jsonb)' in definition)=0 or position('else excluded.attachments end;' in definition)=0 then raise exception 'Connector sync contract changed';end if;
 definition:=replace(definition,'internet_message_id,attachments)','internet_message_id,attachments,join_url,location)');
 definition:=replace(definition,'coalesce(x.attachments,''[]'')','coalesce(x.attachments,''[]''),coalesce(x.join_url,''''),coalesce(x.location,'''')');
 definition:=replace(definition,'attachments jsonb)','attachments jsonb,join_url text,location text)');
 definition:=replace(definition,'else excluded.attachments end;','else excluded.attachments end,join_url=excluded.join_url,location=excluded.location;');
 execute definition;
end $$;
alter table public.meetings add column version integer not null default 1,add column updated_at timestamptz not null default now(),add constraint meeting_workspace_id_unique unique(workspace_id,id);
create trigger touch_version before update on public.meetings for each row execute function relay_private.touch_version();
create function relay_private.meeting_author_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if auth.uid() is not null and new.author_id is distinct from auth.uid() then raise exception 'Meeting author must match session' using errcode='42501';end if;return new;
end $$;
revoke all on function relay_private.meeting_author_guard() from public,anon,authenticated;
create trigger meeting_author_guard before insert on public.meetings for each row execute function relay_private.meeting_author_guard();
alter table public.meetings add column ends_at timestamptz,
 add column description text not null default '', add column location text not null default '',
 add column join_url text not null default '', add column participants jsonb not null default '[]';
alter table public.meetings add constraint meeting_end_order check(ends_at is null or starts_at is null or ends_at>starts_at),
 add constraint meeting_details_bounds check(length(description)<=20000 and length(location)<=300 and length(join_url)<=2048),
 add constraint meeting_join_url check(join_url='' or join_url ~ '^https://(meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|([a-zA-Z0-9-]+\.)*zoom\.us)(/|$)');
create function relay_private.meeting_participants_valid(payload jsonb) returns boolean language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(payload)<>'array' then false when jsonb_array_length(payload)>100 then false else not exists(
 select 1 from jsonb_array_elements(payload) p where jsonb_typeof(p)<>'object' or jsonb_typeof(p->'name') is distinct from 'string' or length(trim(p->>'name')) not between 1 and 160 or
 (p ? 'email' and (jsonb_typeof(p->'email') is distinct from 'string' or length(p->>'email')>254 or (p->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) or (p-'name'-'email')<>'{}'::jsonb) end;
$$;
revoke all on function relay_private.meeting_participants_valid(jsonb) from public,anon;
grant execute on function relay_private.meeting_participants_valid(jsonb) to authenticated;
alter table public.meetings add constraint meeting_participants_bounds check(relay_private.meeting_participants_valid(participants));
create index meeting_agenda_idx on public.meetings(workspace_id,starts_at desc,id);

create table public.meeting_favorites(
 workspace_id uuid not null, meeting_id uuid not null, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(workspace_id,user_id,meeting_id),
 foreign key(workspace_id,meeting_id) references public.meetings(workspace_id,id) on delete cascade
);
create index meeting_favorites_meeting_idx on public.meeting_favorites(workspace_id,meeting_id);
create table public.meeting_record_links(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, meeting_id uuid not null,record_id uuid not null,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(workspace_id,meeting_id) references public.meetings(workspace_id,id) on delete cascade,
 foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade,
 unique(workspace_id,meeting_id,record_id)
);
create index meeting_record_links_record_idx on public.meeting_record_links(workspace_id,record_id);
create function relay_private.meeting_link_limit() returns trigger language plpgsql security invoker set search_path='' as $$begin
 perform 1 from public.meetings where workspace_id=new.workspace_id and id=new.meeting_id for update;
 if not found then raise exception 'Meeting inaccessible' using errcode='42501';end if;
 if not exists(select 1 from public.meeting_record_links where workspace_id=new.workspace_id and meeting_id=new.meeting_id and record_id=new.record_id) and (select count(*) from public.meeting_record_links where workspace_id=new.workspace_id and meeting_id=new.meeting_id)>=100 then raise exception 'Too many linked records' using errcode='22023';end if;
 return new;
end $$;
revoke all on function relay_private.meeting_link_limit() from public,anon,authenticated;
create trigger meeting_link_limit before insert on public.meeting_record_links for each row execute function relay_private.meeting_link_limit();
create table public.meeting_insight_templates(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 150),sections jsonb not null,
 status text not null default 'draft' check(status in ('draft','published','archived')),
 created_by uuid not null default auth.uid() references auth.users(id),version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index meeting_templates_workspace_idx on public.meeting_insight_templates(workspace_id,status,created_at desc,id);
create function relay_private.meeting_sections_valid(payload jsonb) returns boolean language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(payload)<>'array' then false when jsonb_array_length(payload) not between 1 and 6 then false else not exists(
 select 1 from jsonb_array_elements(payload) s where jsonb_typeof(s)<>'object' or jsonb_typeof(s->'title') is distinct from 'string' or length(trim(s->>'title')) not between 1 and 100 or jsonb_typeof(s->'prompt') is distinct from 'string' or length(trim(s->>'prompt')) not between 1 and 450 or coalesce(s->>'format','') not in ('text','list') or (s-'title'-'prompt'-'format')<>'{}'::jsonb) end;
$$;
revoke all on function relay_private.meeting_sections_valid(jsonb) from public,anon;
grant execute on function relay_private.meeting_sections_valid(jsonb) to authenticated;
alter table public.meeting_insight_templates add constraint meeting_sections_bounds check(relay_private.meeting_sections_valid(sections));
create trigger touch_version before update on public.meeting_insight_templates for each row execute function relay_private.touch_version();
create function relay_private.meeting_related_identity() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.workspace_id is distinct from old.workspace_id or new.id is distinct from old.id or new.created_by is distinct from old.created_by then raise exception 'Immutable identity' using errcode='42501';end if; return new;
end $$;
revoke all on function relay_private.meeting_related_identity() from public,anon,authenticated;
create trigger meeting_template_identity before update on public.meeting_insight_templates for each row execute function relay_private.meeting_related_identity();
alter table public.meeting_favorites enable row level security;
alter table public.meeting_record_links enable row level security;
alter table public.meeting_insight_templates enable row level security;
revoke all on public.meeting_favorites,public.meeting_record_links,public.meeting_insight_templates from public,anon,authenticated;
grant select,insert,delete on public.meeting_favorites,public.meeting_record_links to authenticated;
grant select,insert,update,delete on public.meeting_insight_templates to authenticated;
create policy favorite_own on public.meeting_favorites for all to authenticated using(user_id=(select auth.uid()) and relay_private.has_role(workspace_id) and exists(select 1 from public.meetings m where m.workspace_id=meeting_favorites.workspace_id and m.id=meeting_id)) with check(user_id=(select auth.uid()) and relay_private.has_role(workspace_id) and exists(select 1 from public.meetings m where m.workspace_id=meeting_favorites.workspace_id and m.id=meeting_id));
create policy meeting_links_read on public.meeting_record_links for select to authenticated using(relay_private.has_role(workspace_id) and exists(select 1 from public.meetings m where m.workspace_id=meeting_record_links.workspace_id and m.id=meeting_id) and exists(select 1 from public.records r where r.workspace_id=meeting_record_links.workspace_id and r.id=record_id));
create policy meeting_links_insert on public.meeting_record_links for insert to authenticated with check(created_by=(select auth.uid()) and relay_private.has_role(workspace_id,array['owner','admin','member']) and exists(select 1 from public.meetings m where m.workspace_id=meeting_record_links.workspace_id and m.id=meeting_id) and exists(select 1 from public.records r where r.workspace_id=meeting_record_links.workspace_id and r.id=record_id));
create policy meeting_links_delete on public.meeting_record_links for delete to authenticated using(relay_private.has_role(workspace_id,array['owner','admin','member']) and exists(select 1 from public.meetings m where m.workspace_id=meeting_record_links.workspace_id and m.id=meeting_id));
create policy meeting_templates_read on public.meeting_insight_templates for select to authenticated using(relay_private.has_role(workspace_id) and (status='published' or created_by=(select auth.uid()) or relay_private.has_role(workspace_id,array['owner','admin'])));
create policy meeting_templates_insert on public.meeting_insight_templates for insert to authenticated with check(created_by=(select auth.uid()) and relay_private.has_role(workspace_id,array['owner','admin','member']));
create policy meeting_templates_update on public.meeting_insight_templates for update to authenticated using(relay_private.has_role(workspace_id,array['owner','admin','member']) and (created_by=(select auth.uid()) or relay_private.has_role(workspace_id,array['owner','admin']))) with check(relay_private.has_role(workspace_id,array['owner','admin','member']) and (created_by=(select auth.uid()) or relay_private.has_role(workspace_id,array['owner','admin'])));
create policy meeting_templates_delete on public.meeting_insight_templates for delete to authenticated using(relay_private.has_role(workspace_id,array['owner','admin','member']) and (created_by=(select auth.uid()) or relay_private.has_role(workspace_id,array['owner','admin'])));

-- Read only bounded metadata; transcripts and calendar bodies stay out of the library.
-- SECURITY INVOKER preserves meeting privacy, limited readers and calendar owner RLS.
create function public.meeting_library(w uuid,filters jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' set statement_timeout='8s' as $$
declare result jsonb; p integer:=coalesce((filters->>'page')::integer,0);q text:=coalesce(filters->>'q','');v text:=coalesce(filters->>'view','calls');begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if p not between 0 and 100000 or length(q)>200 or v not in ('calls','agenda') or length(coalesce(filters->>'participant',''))>254 or coalesce(filters->>'sort','recent') not in ('recent','oldest') or coalesce(filters->>'favorite','all') not in ('all','only') then raise exception 'Invalid filters' using errcode='22023';end if;
 with sources as (
 select m.id,m.workspace_id,'meeting'::text kind,m.title,m.starts_at,m.ends_at,m.created_at,m.provider,m.status,left(m.summary,600) summary,m.private,m.author_id,m.record_id,m.participants,m.transcript<>'' has_transcript,
 exists(select 1 from public.meeting_favorites f where f.workspace_id=w and f.meeting_id=m.id and f.user_id=(select auth.uid())) favorite
 from public.meetings m where m.workspace_id=w and (v='agenda' or m.status='completed' or m.transcript<>'' or m.summary<>'')
 union all
 select c.id,c.workspace_id,'calendar',c.subject,c.starts_at,c.ends_at,c.created_at,coalesce(i.provider,'calendar'),'scheduled','',true,c.user_id,null,
 coalesce((select jsonb_agg(jsonb_build_object('name',email,'email',email)) from (select distinct trim(email) email from unnest(c.recipients) email where trim(email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(trim(email))<=254 limit 100) people),'[]'::jsonb),false,false
 from public.communications c left join public.integrations i on i.workspace_id=c.workspace_id and i.id=c.integration_id where c.workspace_id=w and c.kind='calendar' and v='agenda'
 ), filtered as (
 select s.*,case when r.id is not null then jsonb_build_object('id',r.id,'display_name',r.display_name) else null end record
 from sources s left join public.records r on r.workspace_id=w and r.id=s.record_id
 where (q='' or strpos(lower(s.title),lower(q))>0 or strpos(lower(s.summary),lower(q))>0)
 and (coalesce(filters->>'provider','all')='all' or s.provider=filters->>'provider')
 and (coalesce(filters->>'favorite','all')='all' or s.favorite)
 and (filters->>'record' is null or s.record_id=(filters->>'record')::uuid or exists(select 1 from public.meeting_record_links l where l.workspace_id=w and l.meeting_id=s.id and l.record_id=(filters->>'record')::uuid))
 and (coalesce(filters->>'participant','')='' or (filters->>'participant'='me' and s.author_id=(select auth.uid())) or exists(select 1 from jsonb_array_elements(s.participants) a where lower(a->>'email')=lower(filters->>'participant')))
 and (filters->>'from' is null or s.starts_at >= (filters->>'from')::timestamptz)
 and (filters->>'until' is null or s.starts_at < (filters->>'until')::timestamptz)
 ), page as (
 select * from filtered order by case when v='calls' then favorite else false end desc,
 case when coalesce(filters->>'sort','recent')='recent' then coalesce(starts_at,created_at) end desc,
 case when filters->>'sort'='oldest' then coalesce(starts_at,created_at) end asc,id limit 25 offset p*25
 ) select jsonb_build_object('data',coalesce((select jsonb_agg(to_jsonb(page)-'author_id'-'record_id') from page),'[]'::jsonb),'count',(select count(*) from filtered),'page',p,'size',25) into result;
 return result;
end $$;
revoke all on function public.meeting_library(uuid,jsonb) from public,anon;
grant execute on function public.meeting_library(uuid,jsonb) to authenticated;
-- Related records can find the meeting without widening its visibility.
do $$declare definition text;pattern text:='from public.meetings where workspace_id=w and record_id=record';begin
 definition:=pg_get_functiondef('public.crm_record_context(uuid,uuid,text)'::regprocedure);
 if position(pattern in definition)=0 then raise exception 'Record context contract changed';end if;
 definition:=replace(definition,pattern,'from public.meetings where workspace_id=w and (record_id=record or exists(select 1 from public.meeting_record_links l where l.workspace_id=w and l.meeting_id=meetings.id and l.record_id=record))');
 execute definition;
end $$;
commit;
