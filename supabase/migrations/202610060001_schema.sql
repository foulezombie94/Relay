-- Relay CRM. Additive schema for the user-authorized project. No existing data is replaced.
create schema if not exists relay_private;
revoke all on schema relay_private from public, anon;
grant usage on schema relay_private to authenticated;

create table public.workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 owner_id uuid not null references auth.users(id), timezone text not null default 'Europe/Paris',
 currency text not null default 'EUR' check(currency ~ '^[A-Z]{3}$'), locale text not null default 'fr',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, role text not null check(role in ('owner','admin','member','viewer')),
 display_name text not null default '', created_at timestamptz not null default now(), unique(workspace_id,user_id)
);
create index memberships_user_idx on public.memberships(user_id,workspace_id);
create index workspaces_owner_idx on public.workspaces(owner_id);

create function relay_private.has_role(w uuid, roles text[] default array['owner','admin','member','viewer']) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.memberships where workspace_id=w and user_id=(select auth.uid()) and role=any(roles));
$$;
revoke all on function relay_private.has_role(uuid,text[]) from public,anon;
grant execute on function relay_private.has_role(uuid,text[]) to authenticated;

create table public.objects (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null, slug text not null check(slug ~ '^[a-z][a-z0-9_-]{1,49}$'), icon text not null default 'box',
 standard boolean not null default false, created_at timestamptz not null default now(), unique(workspace_id,slug), unique(workspace_id,id)
);
create table public.attributes (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 object_id uuid not null, key text not null check(key ~ '^[a-z][a-z0-9_]{0,49}$'), name text not null,
 type text not null check(type in ('text','number','money','date','datetime','boolean','select','multi_select','email','phone','url','location','user','relation','formula')),
 required boolean not null default false, options jsonb not null default '[]', config jsonb not null default '{}',
 archived boolean not null default false, created_at timestamptz not null default now(),
 unique(object_id,key), foreign key(workspace_id,object_id) references public.objects(workspace_id,id) on delete cascade
);
create index attributes_workspace_idx on public.attributes(workspace_id,object_id);
create table public.records (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 object_id uuid not null, display_name text not null check(length(display_name) between 1 and 200), email text, domain text,
 stage text not null default 'Nouveau', amount numeric(18,2) not null default 0, currency text not null default 'EUR' check(currency ~ '^[A-Z]{3}$'),
 owner_id uuid, close_date date, attributes jsonb not null default '{}' check(jsonb_typeof(attributes)='object'),
 archived boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), foreign key(workspace_id,object_id) references public.objects(workspace_id,id),
 foreign key(workspace_id,owner_id) references public.memberships(workspace_id,user_id),
 search tsvector generated always as (to_tsvector('simple',coalesce(display_name,'')||' '||coalesce(email,'')||' '||coalesce(domain,''))) stored
);
create index records_listing_idx on public.records(workspace_id,object_id,archived,created_at desc,id);
create index records_stage_idx on public.records(workspace_id,object_id,stage);
create index records_owner_idx on public.records(workspace_id,owner_id);
create index records_email_idx on public.records(workspace_id,lower(email)) where email is not null;
create index records_search_idx on public.records using gin(search);
create index records_custom_idx on public.records using gin(attributes jsonb_path_ops);
create table public.record_relations (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 source_id uuid not null, target_id uuid not null, label text not null default 'Associé', created_at timestamptz not null default now(),
 foreign key(workspace_id,source_id) references public.records(workspace_id,id) on delete cascade,
 foreign key(workspace_id,target_id) references public.records(workspace_id,id) on delete cascade,
 unique(source_id,target_id,label), check(source_id<>target_id)
);
create index relations_workspace_idx on public.record_relations(workspace_id,source_id);
create index relations_target_idx on public.record_relations(workspace_id,target_id);
create table public.lists (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 object_id uuid not null, name text not null, visibility text not null default 'workspace' check(visibility in ('workspace','private')),
 creator_id uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 unique(workspace_id,id), foreign key(workspace_id,object_id) references public.objects(workspace_id,id)
);
create index lists_workspace_idx on public.lists(workspace_id,object_id);
create index lists_creator_idx on public.lists(creator_id);
create table public.list_entries (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 list_id uuid not null, record_id uuid not null, attributes jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(workspace_id,list_id) references public.lists(workspace_id,id) on delete cascade,
 foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade, unique(list_id,record_id)
);
create index list_entries_workspace_idx on public.list_entries(workspace_id,list_id);
create index list_entries_record_idx on public.list_entries(workspace_id,record_id);
create table public.views (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 object_id uuid not null, name text not null, type text not null default 'table' check(type in ('table','kanban')),
 config jsonb not null default '{}', creator_id uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 foreign key(workspace_id,object_id) references public.objects(workspace_id,id)
);
create index views_workspace_idx on public.views(workspace_id,object_id);
create index views_creator_idx on public.views(creator_id);

create table public.tasks (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 record_id uuid, title text not null check(length(title) between 1 and 300), description text not null default '',
 owner_id uuid, due_date timestamptz, status text not null default 'open' check(status in ('open','in_progress','done','cancelled')),
 priority text not null default 'normal' check(priority in ('low','normal','high')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade,
 foreign key(workspace_id,owner_id) references public.memberships(workspace_id,user_id)
);
create index tasks_workspace_idx on public.tasks(workspace_id,status,due_date);
create index tasks_record_idx on public.tasks(workspace_id,record_id);
create index tasks_owner_idx on public.tasks(workspace_id,owner_id);
create table public.notes (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 record_id uuid, title text not null default '', content text not null, private boolean not null default false,
 author_id uuid not null default auth.uid() references auth.users(id), version int not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade
);
create index notes_workspace_idx on public.notes(workspace_id,record_id);
create index notes_author_idx on public.notes(author_id);
create table public.activities (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 record_id uuid, type text not null, content text not null, author_id uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade
);
create index activities_workspace_idx on public.activities(workspace_id,record_id,created_at desc);
create index activities_author_idx on public.activities(author_id);
create table public.documents (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 record_id uuid, name text not null, path text not null, mime text not null, size bigint not null check(size between 0 and 20971520),
 uploader_id uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 foreign key(workspace_id,record_id) references public.records(workspace_id,id), unique(workspace_id,id)
);
create index documents_workspace_idx on public.documents(workspace_id,record_id);
create index documents_uploader_idx on public.documents(uploader_id);
create table public.meetings (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 record_id uuid, title text not null, starts_at timestamptz, transcript text not null default '', summary text not null default '',
 provider text not null default 'import', status text not null default 'completed', author_id uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), foreign key(workspace_id,record_id) references public.records(workspace_id,id)
);
create index meetings_workspace_idx on public.meetings(workspace_id,record_id);
create index meetings_author_idx on public.meetings(author_id);
create table public.commitments (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 record_id uuid, title text not null, owner_id uuid, due_date timestamptz,
 status text not null default 'proposed' check(status in ('proposed','confirmed','in_progress','done','postponed','cancelled')),
 source_type text not null default 'manual', source_id uuid, source_quote text not null default '',
 evidence text not null default '', uncertainty text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(workspace_id,record_id) references public.records(workspace_id,id), foreign key(workspace_id,owner_id) references public.memberships(workspace_id,user_id)
);
create index commitments_workspace_idx on public.commitments(workspace_id,status,due_date);
create index commitments_record_idx on public.commitments(workspace_id,record_id);
create index commitments_owner_idx on public.commitments(workspace_id,owner_id);
create table public.conflicts (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 record_id uuid, title text not null, field text not null, source_a jsonb not null, source_b jsonb not null,
 status text not null default 'open' check(status in ('open','resolved','dismissed')), resolution text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), foreign key(workspace_id,record_id) references public.records(workspace_id,id)
);
create index conflicts_workspace_idx on public.conflicts(workspace_id,status);
create index conflicts_record_idx on public.conflicts(workspace_id,record_id);
create table public.handovers (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 record_id uuid not null, title text not null, status text not null default 'draft' check(status in ('draft','approved','completed')),
 scope text not null default '', exclusions text not null default '', milestones jsonb not null default '[]',
 commitments_snapshot jsonb not null default '[]', owner_id uuid, version int not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,record_id), foreign key(workspace_id,record_id) references public.records(workspace_id,id), foreign key(workspace_id,owner_id) references public.memberships(workspace_id,user_id)
);
create index handovers_owner_idx on public.handovers(workspace_id,owner_id);
create table public.workflows (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null, definition jsonb not null, enabled boolean not null default false, version int not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,id)
);
create index workflows_workspace_idx on public.workflows(workspace_id,enabled);
create table public.workflow_runs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 workflow_id uuid not null, workflow_version int not null, mode text not null check(mode in ('simulation','live')),
 snapshot jsonb not null, status text not null default 'completed', created_by uuid not null default auth.uid() references auth.users(id),
 executed_at timestamptz, created_at timestamptz not null default now(),
 foreign key(workspace_id,workflow_id) references public.workflows(workspace_id,id), unique(workspace_id,id)
);
create index runs_workspace_idx on public.workflow_runs(workspace_id,workflow_id,created_at desc);
create index runs_creator_idx on public.workflow_runs(created_by);
create table public.sequences (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null, steps jsonb not null default '[]', enabled boolean not null default false,
 timezone text not null default 'Europe/Paris', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,id)
);
create index sequences_workspace_idx on public.sequences(workspace_id);
create table public.enrollments (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 sequence_id uuid not null, record_id uuid not null, step int not null default 0,
 status text not null default 'paused' check(status in ('active','paused','replied','completed','unsubscribed','failed')),
 next_at timestamptz, created_at timestamptz not null default now(),
 foreign key(workspace_id,sequence_id) references public.sequences(workspace_id,id), foreign key(workspace_id,record_id) references public.records(workspace_id,id), unique(sequence_id,record_id)
);
create index enrollments_workspace_idx on public.enrollments(workspace_id,status,next_at);
create index enrollments_record_idx on public.enrollments(workspace_id,record_id);
create table public.suppressions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 email text not null, reason text not null default 'unsubscribed', created_at timestamptz not null default now(), unique(workspace_id,email)
);
create table public.portals (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 record_id uuid not null, name text not null, enabled boolean not null default true, created_at timestamptz not null default now(),
 foreign key(workspace_id,record_id) references public.records(workspace_id,id), unique(workspace_id,id)
);
create index portals_workspace_idx on public.portals(workspace_id,record_id);
create table public.portal_members (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 portal_id uuid not null, email text not null, user_id uuid references auth.users(id), can_comment boolean not null default true,
 revoked boolean not null default false, expires_at timestamptz, created_at timestamptz not null default now(),
 foreign key(workspace_id,portal_id) references public.portals(workspace_id,id) on delete cascade, unique(portal_id,email)
);
create index portal_members_workspace_idx on public.portal_members(workspace_id,portal_id);
create index portal_members_user_idx on public.portal_members(user_id,portal_id);
create function relay_private.portal_access(p uuid, contribute boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.portal_members m join public.portals q on q.id=m.portal_id
 where m.portal_id=p and m.user_id=(select auth.uid()) and not m.revoked and q.enabled and (m.expires_at is null or m.expires_at>now()) and (not contribute or m.can_comment));
$$;
revoke all on function relay_private.portal_access(uuid,boolean) from public,anon;
grant execute on function relay_private.portal_access(uuid,boolean) to authenticated;
create table public.portal_items (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 portal_id uuid not null, title text not null, content text not null default '', type text not null default 'update' check(type in ('update','step','decision','document')),
 status text not null default 'open', due_date timestamptz, document_id uuid,
 created_at timestamptz not null default now(), foreign key(workspace_id,portal_id) references public.portals(workspace_id,id) on delete cascade,
 foreign key(workspace_id,document_id) references public.documents(workspace_id,id), unique(workspace_id,id)
);
create index portal_items_workspace_idx on public.portal_items(workspace_id,portal_id);
create index portal_items_document_idx on public.portal_items(workspace_id,document_id);
create table public.portal_comments (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 portal_id uuid not null, content text not null check(length(content) between 1 and 5000), author_id uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 foreign key(workspace_id,portal_id) references public.portals(workspace_id,id) on delete cascade
);
create index portal_comments_workspace_idx on public.portal_comments(workspace_id,portal_id);
create index portal_comments_author_idx on public.portal_comments(author_id);
create table public.ai_conversations (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id), title text not null default 'Nouvelle conversation',
 messages jsonb not null default '[]', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index conversations_workspace_idx on public.ai_conversations(workspace_id,user_id);
create index conversations_user_idx on public.ai_conversations(user_id);
create table public.integrations (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id), provider text not null, email text,
 status text not null default 'disconnected' check(status in ('connected','disconnected','error')),
 last_sync timestamptz, scopes text[] not null default '{}', created_at timestamptz not null default now(), unique(workspace_id,user_id,provider), unique(workspace_id,id)
);
create index integrations_user_idx on public.integrations(user_id);
create table relay_private.integration_secrets (
 integration_id uuid primary key references public.integrations(id) on delete cascade, encrypted_tokens text not null,
 updated_at timestamptz not null default now()
);
alter table relay_private.integration_secrets enable row level security;
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 actor_id uuid references auth.users(id), entity text not null, entity_id uuid not null, action text not null,
 before_data jsonb, after_data jsonb, private_to uuid references auth.users(id), created_at timestamptz not null default now()
);
create index audit_workspace_idx on public.audit_events(workspace_id,created_at desc);
create index audit_actor_idx on public.audit_events(actor_id);
create index audit_private_idx on public.audit_events(private_to);

alter table public.workspaces enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using (relay_private.has_role(id));
create policy workspace_update on public.workspaces for update to authenticated using (relay_private.has_role(id,array['owner','admin'])) with check(relay_private.has_role(id,array['owner','admin']));
alter table public.memberships enable row level security;
create policy members_read on public.memberships for select to authenticated using (relay_private.has_role(workspace_id));
-- Membership writes only through narrow, checked functions; no direct inserts/role escalation.

do $$ declare t text; begin
 foreach t in array array['objects','attributes','records','record_relations','views','tasks','activities','documents','meetings','commitments','conflicts','handovers','workflows','sequences','enrollments','suppressions','portals'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy %I on public.%I for select to authenticated using (relay_private.has_role(workspace_id))',t||'_read',t);
 execute format('create policy %I on public.%I for insert to authenticated with check (relay_private.has_role(workspace_id,array[''owner'',''admin'',''member'']))',t||'_insert',t);
 execute format('create policy %I on public.%I for update to authenticated using (relay_private.has_role(workspace_id,array[''owner'',''admin'',''member''])) with check (relay_private.has_role(workspace_id,array[''owner'',''admin'',''member'']))',t||'_update',t);
 execute format('create policy %I on public.%I for delete to authenticated using (relay_private.has_role(workspace_id,array[''owner'',''admin'',''member'']))',t||'_delete',t);
 end loop;
end $$;

-- Private lists and notes use their own ACL, inherited by their children.
alter table public.lists enable row level security;
create policy lists_read on public.lists for select to authenticated using(relay_private.has_role(workspace_id) and (visibility='workspace' or creator_id=(select auth.uid())));
create policy lists_write on public.lists for all to authenticated using(relay_private.has_role(workspace_id,array['owner','admin','member']) and (visibility='workspace' or creator_id=(select auth.uid()))) with check(relay_private.has_role(workspace_id,array['owner','admin','member']) and creator_id=(select auth.uid()));
alter table public.list_entries enable row level security;
create policy entries_read on public.list_entries for select to authenticated using(relay_private.has_role(workspace_id) and exists(select 1 from public.lists where id=list_id));
create policy entries_write on public.list_entries for all to authenticated using(relay_private.has_role(workspace_id,array['owner','admin','member']) and exists(select 1 from public.lists where id=list_id)) with check(relay_private.has_role(workspace_id,array['owner','admin','member']) and exists(select 1 from public.lists where id=list_id));
alter table public.notes enable row level security;
create policy notes_read on public.notes for select to authenticated using(relay_private.has_role(workspace_id) and (not private or author_id=(select auth.uid())));
create policy notes_write on public.notes for all to authenticated using(relay_private.has_role(workspace_id,array['owner','admin','member']) and (not private or author_id=(select auth.uid()))) with check(relay_private.has_role(workspace_id,array['owner','admin','member']) and author_id=(select auth.uid()));
alter table public.workflow_runs enable row level security;
create policy runs_read on public.workflow_runs for select to authenticated using(relay_private.has_role(workspace_id));
create policy runs_insert on public.workflow_runs for insert to authenticated with check(relay_private.has_role(workspace_id,array['owner','admin','member']) and created_by=(select auth.uid()) and mode='simulation' and executed_at is null);

alter table public.portal_members enable row level security;
create policy portal_members_admin on public.portal_members for all to authenticated using(relay_private.has_role(workspace_id,array['owner','admin'])) with check(relay_private.has_role(workspace_id,array['owner','admin']));
create policy portals_external_read on public.portals for select to authenticated using(relay_private.portal_access(id));
alter table public.portal_items enable row level security;
create policy portal_items_read on public.portal_items for select to authenticated using(relay_private.has_role(workspace_id) or relay_private.portal_access(portal_id));
create policy portal_items_write on public.portal_items for all to authenticated using(relay_private.has_role(workspace_id,array['owner','admin','member'])) with check(relay_private.has_role(workspace_id,array['owner','admin','member']));
alter table public.portal_comments enable row level security;
create policy portal_comments_read on public.portal_comments for select to authenticated using(relay_private.has_role(workspace_id) or relay_private.portal_access(portal_id));
create policy portal_comments_insert on public.portal_comments for insert to authenticated with check(author_id=(select auth.uid()) and (relay_private.has_role(workspace_id,array['owner','admin','member']) or relay_private.portal_access(portal_id,true)));
alter table public.ai_conversations enable row level security;
create policy conversations_own on public.ai_conversations for all to authenticated using(relay_private.has_role(workspace_id) and user_id=(select auth.uid())) with check(relay_private.has_role(workspace_id) and user_id=(select auth.uid()));
alter table public.integrations enable row level security;
create policy integrations_own_read on public.integrations for select to authenticated using(relay_private.has_role(workspace_id) and user_id=(select auth.uid()));
-- Connections may only be marked connected by the server after the OAuth exchange succeeds.
alter table public.audit_events enable row level security;
create policy audit_read on public.audit_events for select to authenticated using(relay_private.has_role(workspace_id) and (private_to is null or private_to=(select auth.uid())));

create function relay_private.create_workspace(label text) returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid; begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if length(trim(label)) not between 1 and 120 then raise exception 'Invalid workspace name'; end if;
 insert into public.workspaces(name,owner_id) values(trim(label),(select auth.uid())) returning id into w;
 insert into public.memberships(workspace_id,user_id,role,display_name) values(w,(select auth.uid()),'owner',coalesce((select email from auth.users where id=(select auth.uid())),''));
 insert into public.objects(workspace_id,name,slug,icon,standard) values(w,'Personnes','people','users',true),(w,'Entreprises','companies','building',true),(w,'Opportunités','deals','layers',true);
 return w;
end $$;
revoke all on function relay_private.create_workspace(text) from public,anon;
grant execute on function relay_private.create_workspace(text) to authenticated;
create function public.create_workspace(label text) returns uuid language sql security invoker set search_path='' as $$ select relay_private.create_workspace(label); $$;
revoke all on function public.create_workspace(text) from public,anon;
grant execute on function public.create_workspace(text) to authenticated;

create function relay_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb; w uuid; who uuid; begin
 b:=case when tg_op='INSERT' then null else to_jsonb(old) end; a:=case when tg_op='DELETE' then null else to_jsonb(new) end;
 w:=coalesce((a->>'workspace_id')::uuid,(b->>'workspace_id')::uuid); who:=(select auth.uid());
 -- An authenticated membership is required for all user-originated audit writes.
 if who is not null and not relay_private.has_role(w) then raise exception 'Forbidden'; end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,before_data,after_data,private_to)
 values(w,who,tg_table_name,coalesce((a->>'id')::uuid,(b->>'id')::uuid),lower(tg_op),b,a,
 case when tg_table_name='notes' and coalesce((a->>'private')::boolean,(b->>'private')::boolean,false) then coalesce((a->>'author_id')::uuid,(b->>'author_id')::uuid) else null end);
 return coalesce(new,old);
end $$;
revoke all on function relay_private.audit_change() from public,anon,authenticated;
create function relay_private.touch_version() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 new.updated_at:=now(); new.version:=old.version+1; return new;
end $$;
revoke all on function relay_private.touch_version() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['records','notes','handovers','workflows'] loop execute format('create trigger touch_version before update on public.%I for each row execute function relay_private.touch_version()',t); end loop;
 foreach t in array array['records','notes','tasks','commitments','conflicts','handovers','workflows','portals','portal_members','portal_items'] loop execute format('create trigger audit after insert or update or delete on public.%I for each row execute function relay_private.audit_change()',t); end loop;
end $$;

-- Explicit Data API grants; all exposed tables are covered by RLS above.
grant select on all tables in schema public to authenticated;
grant insert,update,delete on public.objects,public.attributes,public.records,public.record_relations,public.lists,public.list_entries,public.views,public.tasks,public.notes,public.activities,public.documents,public.meetings,public.commitments,public.conflicts,public.handovers,public.workflows,public.sequences,public.enrollments,public.suppressions,public.portals,public.portal_members,public.portal_items,public.portal_comments,public.ai_conversations to authenticated;
grant insert on public.workflow_runs to authenticated;
grant update on public.workspaces to authenticated;

-- Private bucket. The first path segment is a workspace UUID. External users access only explicitly shared documents.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('relay-documents','relay-documents',false,20971520,array['application/pdf','text/plain','text/csv','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) on conflict(id) do nothing;
create policy relay_storage_read on storage.objects for select to authenticated using(bucket_id='relay-documents' and exists(select 1 from public.documents d where d.path=name and (relay_private.has_role(d.workspace_id) or exists(select 1 from public.portal_items i where i.document_id=d.id and relay_private.portal_access(i.portal_id)))));
create policy relay_storage_insert on storage.objects for insert to authenticated with check(bucket_id='relay-documents' and (storage.foldername(name))[1] in (select workspace_id::text from public.memberships where user_id=(select auth.uid()) and role in ('owner','admin','member')));
create policy relay_storage_delete on storage.objects for delete to authenticated using(bucket_id='relay-documents' and (storage.foldername(name))[1] in (select workspace_id::text from public.memberships where user_id=(select auth.uid()) and role in ('owner','admin','member')));
