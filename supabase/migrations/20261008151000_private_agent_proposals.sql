begin;
-- Extracted private communications remain private even after human acceptance.
alter table public.commitments add column private boolean not null default false,add column author_id uuid default auth.uid() references auth.users(id);
alter table public.conflicts add column private boolean not null default false,add column author_id uuid default auth.uid() references auth.users(id);
create index commitments_private_owner on public.commitments(workspace_id,author_id) where private;
create index conflicts_private_owner on public.conflicts(workspace_id,author_id) where private;
create policy commitment_private on public.commitments as restrictive for all to authenticated using(not private or author_id=auth.uid()) with check(not private or author_id=auth.uid());
create policy conflict_private on public.conflicts as restrictive for all to authenticated using(not private or author_id=auth.uid()) with check(not private or author_id=auth.uid());
create function relay_private.proposal_privacy() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='UPDATE' and (new.private is distinct from old.private or new.author_id is distinct from old.author_id) then raise exception 'Proposal privacy cannot be changed' using errcode='42501';end if;
 if tg_op='INSERT' and tg_table_name='commitments' then
  if new.source_type='email' then
   if not exists(select 1 from public.communications where workspace_id=new.workspace_id and id=new.source_id and user_id=auth.uid() and position(new.source_quote in body)>0 and nullif(new.source_quote,'') is not null) then raise exception 'Email citation inaccessible' using errcode='42501';end if;
   new.private:=true;new.author_id:=auth.uid();
  elsif new.source_type='meeting' and exists(select 1 from public.meetings where workspace_id=new.workspace_id and id=new.source_id and private) then new.private:=true;new.author_id:=auth.uid();
  elsif new.source_type='note' and exists(select 1 from public.notes where workspace_id=new.workspace_id and id=new.source_id and private) then new.private:=true;new.author_id:=auth.uid();end if;
 end if;
 return new;end $$;
revoke all on function relay_private.proposal_privacy() from public,anon,authenticated;
create trigger proposal_privacy before insert or update on public.commitments for each row execute function relay_private.proposal_privacy();
create trigger proposal_privacy before insert or update on public.conflicts for each row execute function relay_private.proposal_privacy();
create or replace function relay_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb;a jsonb;w uuid;who uuid;private_to uuid;begin
 b:=case when tg_op='INSERT' then null else to_jsonb(old)-'agent_search'-'search' end;
 a:=case when tg_op='DELETE' then null else to_jsonb(new)-'agent_search'-'search' end;
 w:=coalesce((a->>'workspace_id')::uuid,(b->>'workspace_id')::uuid);who:=auth.uid();
 if not exists(select 1 from public.workspaces where id=w) then return coalesce(new,old);end if;
 if who is not null and not relay_private.has_role(w) then raise exception 'Forbidden';end if;
 if tg_table_name in ('notes','meetings','commitments','conflicts') and (coalesce((a->>'private')::boolean,false) or coalesce((b->>'private')::boolean,false)) then private_to:=coalesce((a->>'author_id')::uuid,(b->>'author_id')::uuid);end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,before_data,after_data,private_to) values(w,who,tg_table_name,coalesce((a->>'id')::uuid,(b->>'id')::uuid),lower(tg_op),b,a,private_to);
 return coalesce(new,old);
end $$;
commit;
