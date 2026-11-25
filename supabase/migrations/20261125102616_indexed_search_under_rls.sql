begin;
-- Performance audit P-06. ILIKE and full-text @@ are not leakproof, so under RLS
-- PostgreSQL may not use an index for them: every record lookup and Ctrl+K search read
-- the whole workspace table (0.4 to 1.2 s per table at 100 000 records).
--
-- The match now runs in two steps. A SECURITY DEFINER helper (relay_private, not exposed
-- by the API) finds the matching ids of the workspace through an index. The public
-- functions are SECURITY INVOKER: they read the rows themselves under the normal RLS
-- policies, keeping only visible rows among those ids. uuid equality is leakproof, so
-- the primary key is used. No row the caller cannot read is returned or counted.
--
-- Write cost: three trigram GIN indexes on records (display_name, email, domain). GIN
-- fastupdate batches their maintenance; measure insert latency on large imports.

create extension if not exists pg_trgm with schema extensions;
create index if not exists records_name_trgm_idx on public.records using gin (display_name extensions.gin_trgm_ops);
create index if not exists records_email_trgm_idx on public.records using gin (email extensions.gin_trgm_ops);
create index if not exists records_domain_trgm_idx on public.records using gin (domain extensions.gin_trgm_ops);

-- Ids of the workspace's records whose name, email or domain contains the term. Below 3
-- characters a trigram index cannot help: the callers keep the direct query then.
create function relay_private.record_match_ids(w uuid, term text) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare p text:='%'||replace(replace(replace(term,'\','\\'),'%','\%'),'_','\_')||'%';
begin
 if term is null or length(term)<3 or length(term)>200 or not relay_private.has_role(w) then return '{}';end if;
 return array(select r.id from public.records r where r.workspace_id=w
  and (r.display_name ilike p or r.email ilike p or r.domain ilike p));
end $$;

-- Ids of the workspace's rows of one kind whose search vector matches the web-style
-- query, with the same configuration as before ('simple').
create function relay_private.search_match_ids(w uuid, kind text, term text) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare q tsquery;
begin
 if term is null or length(term)<2 or length(term)>200 or not relay_private.has_role(w) then return '{}';end if;
 q:=websearch_to_tsquery('simple',term);
 return case kind
  when 'records' then array(select x.id from public.records x where x.workspace_id=w and x.search @@ q)
  when 'notes' then array(select x.id from public.notes x where x.workspace_id=w and x.search_index @@ q)
  when 'tasks' then array(select x.id from public.tasks x where x.workspace_id=w and x.search_index @@ q)
  when 'commitments' then array(select x.id from public.commitments x where x.workspace_id=w and x.search_index @@ q)
  when 'meetings' then array(select x.id from public.meetings x where x.workspace_id=w and x.search_index @@ q)
  else '{}'::uuid[] end;
end $$;
revoke all on function relay_private.record_match_ids(uuid,text) from public,anon;
revoke all on function relay_private.search_match_ids(uuid,text,text) from public,anon;
grant execute on function relay_private.record_match_ids(uuid,text) to authenticated;
grant execute on function relay_private.search_match_ids(uuid,text,text) to authenticated;

-- Invoker functions: plain SQL without SET clauses so the planner inlines them, applies
-- RLS to the rows, and pushes the caller's filters, order and range into one query.
create function public.records_matching(w uuid, term text) returns setof public.records
language sql stable as $$
 select r.* from public.records r where r.workspace_id=w and r.id=any(relay_private.record_match_ids(w,term))
$$;
create function public.records_search(w uuid, term text) returns setof public.records
language sql stable as $$
 select x.* from public.records x where x.workspace_id=w and x.id=any(relay_private.search_match_ids(w,'records',term))
$$;
create function public.notes_search(w uuid, term text) returns setof public.notes
language sql stable as $$
 select x.* from public.notes x where x.workspace_id=w and x.id=any(relay_private.search_match_ids(w,'notes',term))
$$;
create function public.tasks_search(w uuid, term text) returns setof public.tasks
language sql stable as $$
 select x.* from public.tasks x where x.workspace_id=w and x.id=any(relay_private.search_match_ids(w,'tasks',term))
$$;
create function public.commitments_search(w uuid, term text) returns setof public.commitments
language sql stable as $$
 select x.* from public.commitments x where x.workspace_id=w and x.id=any(relay_private.search_match_ids(w,'commitments',term))
$$;
create function public.meetings_search(w uuid, term text) returns setof public.meetings
language sql stable as $$
 select x.* from public.meetings x where x.workspace_id=w and x.id=any(relay_private.search_match_ids(w,'meetings',term))
$$;
do $$declare f text;begin
 foreach f in array array['records_matching','records_search','notes_search','tasks_search','commitments_search','meetings_search'] loop
  execute format('revoke all on function public.%I(uuid,text) from public,anon',f);
  execute format('grant execute on function public.%I(uuid,text) to authenticated',f);
 end loop;
end $$;
commit;
