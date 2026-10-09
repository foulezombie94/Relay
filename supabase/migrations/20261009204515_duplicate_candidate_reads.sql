begin;
set local lock_timeout='5s';
create function relay_private.crm_duplicate_key(kind text,value text) returns text language plpgsql immutable strict set search_path='' as $$
declare v text;begin
 if kind='email' then return lower(btrim(value));end if;
 if kind='name' then return btrim(regexp_replace(regexp_replace(lower(normalize(value,NFKD)),U&'[\0300-\036f]','','g'),'[^[:alnum:]]+',' ','g'));end if;
 if kind<>'domain' then return null;end if;
 v:=lower(btrim(value));
 if position('://' in v)=0 then v:='https://'||v;end if;
 v:=substring(v from '^[a-z][a-z0-9+.-]*://([^/?#]+)');
 v:=regexp_replace(v,'^.*@','');v:=regexp_replace(v,':[0-9]+$','');
 -- WHATWG IDN, encoded hosts and IP canonicalisation are rechecked in TS.
 -- They are explicitly reported as partial, never silently called exhaustive.
 if v is null or v !~ '^[a-z0-9][a-z0-9.-]*$' or v~'^[0-9.]+$' then return null;end if;
 return regexp_replace(v,'^www\.','');
end $$;
revoke all on function relay_private.crm_duplicate_key(text,text) from public,anon;
grant execute on function relay_private.crm_duplicate_key(text,text) to authenticated;
create index records_duplicate_email_idx on public.records(workspace_id,object_id,(relay_private.crm_duplicate_key('email',email)),id) where not archived;
create index records_duplicate_name_idx on public.records(workspace_id,object_id,(relay_private.crm_duplicate_key('name',display_name)),id) where not archived;
create index records_duplicate_domain_idx on public.records(workspace_id,object_id,(relay_private.crm_duplicate_key('domain',domain)),id) where not archived;
create function public.crm_duplicate_candidates(w uuid,object_filter uuid default null) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='10s' as $$
declare result jsonb;begin
 if not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 with base as materialized(select id,object_id,relay_private.crm_duplicate_key('email',email) email_key,relay_private.crm_duplicate_key('name',display_name) name_key,relay_private.crm_duplicate_key('domain',domain) domain_key,nullif(domain,'') domain from public.records where workspace_id=w and not archived and (object_filter is null or object_id=object_filter)),
 blocked as materialized(select record_a,record_b from public.duplicate_decisions where workspace_id=w and (status='separate' or defer_until>now())),
 email_pairs as materialized(select a.id a,b.id b,0 rank from base a join base b on b.object_id=a.object_id and b.email_key=a.email_key and b.id>a.id where length(a.email_key)>=3 and not exists(select 1 from blocked d where d.record_a=a.id and d.record_b=b.id) limit 251),
 name_pairs as materialized(select a.id a,b.id b,1 rank from base a join base b on b.object_id=a.object_id and b.name_key=a.name_key and b.id>a.id where length(a.name_key)>=3 and not exists(select 1 from blocked d where d.record_a=a.id and d.record_b=b.id) limit 251),
 domain_pairs as materialized(select a.id a,b.id b,1 rank from base a join base b on b.object_id=a.object_id and b.domain_key=a.domain_key and b.id>a.id where length(a.domain_key)>=3 and not exists(select 1 from blocked d where d.record_a=a.id and d.record_b=b.id) limit 251),
 pairs as(select a,b,min(rank) rank from(select * from email_pairs union all select * from name_pairs union all select * from domain_pairs) p group by a,b),
 ordered as materialized(select * from pairs order by rank,a,b limit 251),
 page as(select * from ordered order by rank,a,b limit 250),
 details as(select p.a::text||':'||p.b::text key,to_jsonb(ra)-'search' a,to_jsonb(rb)-'search' b,p.rank from page p join public.records ra on ra.workspace_id=w and ra.id=p.a join public.records rb on rb.workspace_id=w and rb.id=p.b order by p.rank,p.a,p.b)
 select jsonb_build_object('data',coalesce((select jsonb_agg(to_jsonb(details)-'rank') from details),'[]'),'total',(select count(*) from base),
 'truncated',(select count(*) from ordered)>250 or (select count(*) from email_pairs)=251 or (select count(*) from name_pairs)=251 or (select count(*) from domain_pairs)=251,
 'normalization_partial',exists(select 1 from base where domain is not null and domain_key is null)) into result;
 return result;
end $$;
revoke all on function public.crm_duplicate_candidates(uuid,uuid) from public,anon;
grant execute on function public.crm_duplicate_candidates(uuid,uuid) to authenticated;
commit;
