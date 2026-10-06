create table public.invitations (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 email text not null, role text not null check(role in ('admin','member','viewer')), inviter_id uuid not null default auth.uid() references auth.users(id),
 expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz, created_at timestamptz not null default now(), unique(workspace_id,email)
);
create index invitations_inviter_idx on public.invitations(inviter_id);
alter table public.invitations enable row level security;
create policy invitations_admin on public.invitations for all to authenticated using(relay_private.has_role(workspace_id,array['owner','admin'])) with check(relay_private.has_role(workspace_id,array['owner','admin']) and inviter_id=(select auth.uid()));
grant select,insert,update,delete on public.invitations to authenticated;

create function relay_private.claim_invitations() returns void language plpgsql security definer set search_path='' as $$
declare who uuid; mail text; begin
 who:=(select auth.uid());if who is null then raise exception 'Authentication required';end if;
 select lower(email) into mail from auth.users where id=who and email_confirmed_at is not null;
 if mail is null then return;end if;
 insert into public.memberships(workspace_id,user_id,role,display_name)
 select workspace_id,who,role,mail from public.invitations where lower(email)=mail and expires_at>now() and accepted_at is null on conflict(workspace_id,user_id) do nothing;
 update public.invitations set accepted_at=now() where lower(email)=mail and expires_at>now() and accepted_at is null;
 update public.portal_members set user_id=who where lower(email)=mail and user_id is null and not revoked and (expires_at is null or expires_at>now());
end $$;
revoke all on function relay_private.claim_invitations() from public,anon;
grant execute on function relay_private.claim_invitations() to authenticated;
create function public.claim_invitations() returns void language sql security invoker set search_path='' as $$select relay_private.claim_invitations();$$;
revoke all on function public.claim_invitations() from public,anon;
grant execute on function public.claim_invitations() to authenticated;

create function relay_private.change_member(w uuid, u uuid, r text) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden';end if;
 if exists(select 1 from public.memberships where workspace_id=w and user_id=u and role='owner') then raise exception 'Owner cannot be changed here';end if;
 if r='remove' then delete from public.memberships where workspace_id=w and user_id=u;
 elsif r in ('admin','member','viewer') then update public.memberships set role=r where workspace_id=w and user_id=u;
 else raise exception 'Invalid role';end if;
end $$;
revoke all on function relay_private.change_member(uuid,uuid,text) from public,anon;
grant execute on function relay_private.change_member(uuid,uuid,text) to authenticated;
create function public.change_member(w uuid,u uuid,r text) returns void language sql security invoker set search_path='' as $$select relay_private.change_member(w,u,r);$$;
revoke all on function public.change_member(uuid,uuid,text) from public,anon;
grant execute on function public.change_member(uuid,uuid,text) to authenticated;

-- Narrow privileged executor: takes a saved preview ID, not caller-supplied effects.
create function relay_private.execute_preview(preview uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare run public.workflow_runs%rowtype; wf public.workflows%rowtype; rec public.records%rowtype; item jsonb; effect jsonb; total int:=0; due timestamptz;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required';end if;
 select * into run from public.workflow_runs where id=preview for update;
 if not found or not relay_private.has_role(run.workspace_id,array['owner','admin','member']) or run.created_by<>(select auth.uid()) then raise exception 'Forbidden';end if;
 if run.executed_at is not null then return jsonb_build_object('already_executed',true);end if;
 if run.mode<>'simulation' or run.created_at<now()-interval '15 minutes' then raise exception 'Preview expired';end if;
 select * into wf from public.workflows where id=run.workflow_id and workspace_id=run.workspace_id for update;
 if wf.version<>run.workflow_version then raise exception 'Workflow changed';end if;
 if jsonb_array_length(run.snapshot->'records')>100 then raise exception 'Preview too large';end if;
 -- Validate every row and action before performing any mutation. One transaction guarantees rollback.
 for item in select value from jsonb_array_elements(run.snapshot->'records') loop
 select * into rec from public.records where id=(item->>'id')::uuid and workspace_id=run.workspace_id for update;
 if not found or rec.archived or rec.version<>(item->>'version')::int then raise exception 'Record changed';end if;
 for effect in select value from jsonb_array_elements(item->'changes') loop
 if effect->>'type'='email' then raise exception 'An email connection is required. No changes applied.';end if;
 if effect->>'type' not in ('task','set_field') then raise exception 'Unsupported action';end if;
 if effect->>'type'='set_field' and effect->>'field' not in ('stage','owner_id','close_date') then raise exception 'Forbidden field';end if;
 end loop;
 end loop;
 for item in select value from jsonb_array_elements(run.snapshot->'records') loop
 for effect in select value from jsonb_array_elements(item->'changes') loop
 if effect->>'type'='task' then
 due:=(effect->>'due_date')::timestamptz;
 insert into public.tasks(workspace_id,record_id,title,due_date,owner_id) values(run.workspace_id,(item->>'id')::uuid,effect->>'title',due,(select auth.uid()));
 elsif effect->>'field'='stage' then update public.records set stage=effect->>'value' where id=(item->>'id')::uuid and workspace_id=run.workspace_id;
 elsif effect->>'field'='owner_id' then update public.records set owner_id=nullif(effect->>'value','')::uuid where id=(item->>'id')::uuid and workspace_id=run.workspace_id;
 elsif effect->>'field'='close_date' then update public.records set close_date=nullif(effect->>'value','')::date where id=(item->>'id')::uuid and workspace_id=run.workspace_id;
 end if;total:=total+1;
 end loop;
 end loop;
 update public.workflow_runs set executed_at=now(),status='completed' where id=preview;
 return jsonb_build_object('actions',total);
end $$;
revoke all on function relay_private.execute_preview(uuid) from public,anon;
-- Only the server can store snapshots; the caller may execute their own trusted saved preview.
grant execute on function relay_private.execute_preview(uuid) to authenticated;
create function public.execute_preview(preview uuid) returns jsonb language sql security invoker set search_path='' as $$select relay_private.execute_preview(preview);$$;
revoke all on function public.execute_preview(uuid) from public,anon;
grant execute on function public.execute_preview(uuid) to authenticated;

-- Cannot let a caller craft a preview with arbitrary effects and then execute it through a definer.
-- Server stores snapshots; UI can read its workspace history through RLS.
revoke insert on public.workflow_runs from authenticated;
drop policy runs_insert on public.workflow_runs;

create policy documents_external_read on public.documents for select to authenticated using(exists(select 1 from public.portal_items i where i.document_id=documents.id and relay_private.portal_access(i.portal_id)));

create function relay_private.immutable_workspace() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.workspace_id<>old.workspace_id then raise exception 'Workspace is immutable';end if;return new;end $$;
revoke all on function relay_private.immutable_workspace() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['objects','attributes','records','record_relations','lists','list_entries','views','tasks','notes','activities','documents','meetings','commitments','conflicts','handovers','workflows','sequences','enrollments','suppressions','portals','portal_members','portal_items','portal_comments','ai_conversations','integrations','invitations'] loop
 execute format('create trigger immutable_workspace before update on public.%I for each row execute function relay_private.immutable_workspace()',t);
 end loop;
end $$;

-- Defend constraints when a client bypasses the web API and calls PostgREST directly.
create function relay_private.validate_commitment() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.status='done' and length(trim(new.evidence))=0 then raise exception 'Evidence required';end if;return new;end $$;
revoke all on function relay_private.validate_commitment() from public,anon,authenticated;
create trigger commitment_evidence before insert or update on public.commitments for each row execute function relay_private.validate_commitment();
