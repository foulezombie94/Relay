begin;
create or replace function relay_private.merge_records(w uuid,src uuid,dst uuid,sv integer,tv integer,picks jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.records; d public.records; result public.records; payload jsonb; attrs jsonb; key text; tbl text; links jsonb;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Fusion réservée aux administrateurs' using errcode='42501';end if;
 if sv is null or tv is null or sv<1 or tv<1 then raise exception 'Versions requises' using errcode='22023';end if;
 if src=dst then raise exception 'Choisissez deux fiches différentes' using errcode='22023';end if;
 if jsonb_typeof(picks)<>'object' or picks is null then raise exception 'Choix invalides' using errcode='22023';end if;
 perform id from public.records where workspace_id=w and id in(src,dst) order by id for update;
 select * into s from public.records where workspace_id=w and id=src;
 select * into d from public.records where workspace_id=w and id=dst;
 if s.id is null or d.id is null or s.archived or d.archived or s.object_id<>d.object_id then raise exception 'Fiches inaccessibles, archivées ou de types différents' using errcode='22023';end if;
 if s.version<>sv or d.version<>tv then raise exception 'Une fiche a changé. Rechargez l’aperçu.' using errcode='40001';end if;
 if exists(select 1 from public.handovers a join public.handovers b on b.workspace_id=a.workspace_id where a.workspace_id=w and a.record_id=src and b.record_id=dst) then raise exception 'Deux dossiers de réalisation : résolvez-les avant la fusion' using errcode='22023';end if;
 if exists(select 1 from public.enrollments a join public.enrollments b on b.workspace_id=a.workspace_id and b.sequence_id=a.sequence_id where a.workspace_id=w and a.record_id=src and b.record_id=dst) then raise exception 'Les fiches sont inscrites à une même séquence. Résolvez cette inscription avant la fusion.' using errcode='22023';end if;
 if s.currency<>d.currency and coalesce(picks->>'amount','target')<>coalesce(picks->>'currency','target') then raise exception 'Le montant et sa devise doivent provenir de la même fiche.' using errcode='22023';end if;
 payload:=to_jsonb(d);attrs:=s.attributes||d.attributes;
 for key in select jsonb_object_keys(picks) loop
  if picks->>key is null or picks->>key not in('source','target') then raise exception 'Choix invalide' using errcode='22023';end if;
  if key=any(array['display_name','email','domain','stage','amount','currency','owner_id','close_date']) then
   if picks->>key='source' then payload:=jsonb_set(payload,array[key],to_jsonb(s)->key);end if;
  elsif left(key,5)='attr:' and (s.attributes?substr(key,6) or d.attributes?substr(key,6)) then
   if picks->>key='source' then attrs:=jsonb_set(attrs,array[substr(key,6)],coalesce(s.attributes->substr(key,6),'null'::jsonb));
   else attrs:=jsonb_set(attrs,array[substr(key,6)],coalesce(d.attributes->substr(key,6),'null'::jsonb));end if;
  else raise exception 'Champ de fusion non autorisé' using errcode='22023';end if;
 end loop;
 payload:=jsonb_set(payload,'{attributes}',attrs);
 result:=jsonb_populate_record(null::public.records,payload);
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into links from public.record_relations r where workspace_id=w and (source_id=src or target_id=src);
 insert into public.merge_history(workspace_id,source_id,target_id,actor_id,snapshot,choices) values(w,src,dst,auth.uid(),jsonb_build_object('source',to_jsonb(s)-'search','target',to_jsonb(d)-'search','relations',links),picks);
 update public.records set display_name=result.display_name,email=result.email,domain=result.domain,stage=result.stage,amount=result.amount,currency=result.currency,owner_id=result.owner_id,close_date=result.close_date,attributes=result.attributes where workspace_id=w and id=dst;
 -- Keep private list metadata inside the same private list entry.
 update public.list_entries b set merge_provenance=b.merge_provenance||jsonb_build_array(jsonb_build_object('entry_id',a.id,'record_id',src,'attributes',a.attributes,'provenance',a.merge_provenance))
 from public.list_entries a where a.workspace_id=w and b.workspace_id=w and a.record_id=src and b.record_id=dst and a.list_id=b.list_id;
 delete from public.list_entries a using public.list_entries b where a.workspace_id=w and b.workspace_id=w and a.record_id=src and b.record_id=dst and a.list_id=b.list_id;
 update public.list_entries set record_id=dst where workspace_id=w and record_id=src;
 insert into public.record_relations(workspace_id,source_id,target_id,label)
 select w,case when source_id=src then dst else source_id end,case when target_id=src then dst else target_id end,label
 from public.record_relations where workspace_id=w and (source_id=src or target_id=src)
 and (case when source_id=src then dst else source_id end)<>(case when target_id=src then dst else target_id end)
 on conflict(source_id,target_id,label) do nothing;
 delete from public.record_relations where workspace_id=w and (source_id=src or target_id=src);
 foreach tbl in array array['tasks','notes','activities','documents','meetings','commitments','conflicts','portals','handovers','enrollments'] loop
 execute format('update public.%I set record_id=$1 where workspace_id=$2 and record_id=$3',tbl) using dst,w,src;
 end loop;
 update public.records set merged_into=dst where workspace_id=w and merged_into=src;
 update public.records set archived=true,merged_into=dst where workspace_id=w and id=src;
 return jsonb_build_object('id',dst,'archived_id',src);
end $$;

commit;
