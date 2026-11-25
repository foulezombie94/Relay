begin;
-- French users often type without accents: « societe » must find « Société ». The
-- record lookup (ILIKE) and the Ctrl+K full-text search compared accents exactly.
--
-- Full text: a 'french' configuration whose words go through unaccent then the French
-- stemmer, used by expression indexes and by the queries of relay_private.search_match_ids
-- only. The stored 'simple' search columns are unchanged, so the AI agent, the public
-- API and the trash keep their current behaviour.
-- Substring lookup: the trigram indexes now cover unaccent(column) and the term goes
-- through the same function.
-- Write cost: five full-text expression indexes; the three trigram indexes are replaced.

create extension if not exists unaccent with schema extensions;

create text search configuration relay_private.french_unaccent (copy = pg_catalog.french);
alter text search configuration relay_private.french_unaccent
 alter mapping for hword, hword_part, word with extensions.unaccent, pg_catalog.french_stem;

-- unaccent() is only STABLE (its dictionary could change); fixing the dictionary makes
-- the result depend on the text alone, so it can back an index.
create function relay_private.unaccented(t text) returns text
language sql immutable strict parallel safe set search_path='' as $$
 select extensions.unaccent('extensions.unaccent'::regdictionary, t)
$$;

drop index if exists public.records_name_trgm_idx;
drop index if exists public.records_email_trgm_idx;
drop index if exists public.records_domain_trgm_idx;
create index records_name_trgm_idx on public.records using gin (relay_private.unaccented(display_name) extensions.gin_trgm_ops);
create index records_email_trgm_idx on public.records using gin (relay_private.unaccented(email) extensions.gin_trgm_ops);
create index records_domain_trgm_idx on public.records using gin (relay_private.unaccented(domain) extensions.gin_trgm_ops);

create index records_search_fr_idx on public.records using gin (to_tsvector('relay_private.french_unaccent'::regconfig, coalesce(display_name,'')||' '||coalesce(email,'')||' '||coalesce(domain,'')));
create index notes_search_fr_idx on public.notes using gin (to_tsvector('relay_private.french_unaccent'::regconfig, coalesce(title,'')||' '||content));
create index tasks_search_fr_idx on public.tasks using gin (to_tsvector('relay_private.french_unaccent'::regconfig, title||' '||coalesce(description,'')));
create index commitments_search_fr_idx on public.commitments using gin (to_tsvector('relay_private.french_unaccent'::regconfig, title||' '||coalesce(source_quote,'')));
create index meetings_search_fr_idx on public.meetings using gin (to_tsvector('relay_private.french_unaccent'::regconfig, title||' '||coalesce(summary,'')));

create or replace function relay_private.record_match_ids(w uuid, term text) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare p text;
begin
 if term is null or length(term)<3 or length(term)>200 or not relay_private.has_role(w) then return '{}';end if;
 p:='%'||replace(replace(replace(relay_private.unaccented(term),'\','\\'),'%','\%'),'_','\_')||'%';
 return array(select r.id from public.records r where r.workspace_id=w
  and (relay_private.unaccented(r.display_name) ilike p or relay_private.unaccented(r.email) ilike p or relay_private.unaccented(r.domain) ilike p));
end $$;

-- Same expressions as the indexes above, so the planner uses them.
create or replace function relay_private.search_match_ids(w uuid, kind text, term text) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare q tsquery;
begin
 if term is null or length(term)<2 or length(term)>200 or not relay_private.has_role(w) then return '{}';end if;
 q:=websearch_to_tsquery('relay_private.french_unaccent'::regconfig,term);
 return case kind
  when 'records' then array(select x.id from public.records x where x.workspace_id=w
   and to_tsvector('relay_private.french_unaccent'::regconfig, coalesce(x.display_name,'')||' '||coalesce(x.email,'')||' '||coalesce(x.domain,'')) @@ q)
  when 'notes' then array(select x.id from public.notes x where x.workspace_id=w
   and to_tsvector('relay_private.french_unaccent'::regconfig, coalesce(x.title,'')||' '||x.content) @@ q)
  when 'tasks' then array(select x.id from public.tasks x where x.workspace_id=w
   and to_tsvector('relay_private.french_unaccent'::regconfig, x.title||' '||coalesce(x.description,'')) @@ q)
  when 'commitments' then array(select x.id from public.commitments x where x.workspace_id=w
   and to_tsvector('relay_private.french_unaccent'::regconfig, x.title||' '||coalesce(x.source_quote,'')) @@ q)
  when 'meetings' then array(select x.id from public.meetings x where x.workspace_id=w
   and to_tsvector('relay_private.french_unaccent'::regconfig, x.title||' '||coalesce(x.summary,'')) @@ q)
  else '{}'::uuid[] end;
end $$;
revoke all on function relay_private.unaccented(text) from public,anon;
grant execute on function relay_private.unaccented(text) to authenticated;
commit;
