begin;
do $fixtures$
declare u uuid;v uuid:=gen_random_uuid();x uuid:=gen_random_uuid();w uuid:=gen_random_uuid();other uuid:=gen_random_uuid();obj uuid:=gen_random_uuid();begin
 select id into u from auth.users order by created_at limit 1;if u is null then raise exception 'Un compte Auth est nécessaire.';end if;
 insert into auth.users(id,email,aud,role) values(v,'relay-trash-'||v||'@example.invalid','authenticated','authenticated'),(x,'relay-trash-'||x||'@example.invalid','authenticated','authenticated');
 insert into public.workspaces(id,name,owner_id) values(w,'Relay trash rollback',u),(other,'Relay trash outside',x);
 insert into public.memberships(workspace_id,user_id,role,display_name) values(w,u,'owner','Propriétaire'),(w,v,'member','Membre'),(other,x,'owner','Autre');
 insert into public.objects(id,workspace_id,name,slug) values(obj,w,'Contacts test','people');
 perform set_config('relay_test.workspace',w::text,true);perform set_config('relay_test.object',obj::text,true);
 perform set_config('relay_test.member',v::text,true);perform set_config('relay_test.outsider',x::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true);
end $fixtures$;
set local role authenticated;
do $member$
declare w uuid:=current_setting('relay_test.workspace')::uuid;obj uuid:=current_setting('relay_test.object')::uuid;r uuid;h jsonb;begin
 insert into public.records(workspace_id,object_id,display_name,email,attributes) values(w,obj,'Alice','alice@example.invalid','{"secteur":"SaaS"}') returning id into r;
 perform set_config('relay_test.record',r::text,true);
 update public.records set email='alice@acme.example',attributes='{"secteur":"Industrie"}' where id=r;
 update public.records set display_name='Alice Martin' where id=r;
 h:=public.record_field_history(w,r);
 if not exists(select 1 from jsonb_array_elements(h) e where e->>'field'='email' and e->>'before'='alice@example.invalid' and e->>'after'='alice@acme.example' and e->>'actor_name'='Membre') then raise exception 'Historique email absent: %',h;end if;
 if not exists(select 1 from jsonb_array_elements(h) e where e->>'field'='attributes.secteur' and e->'after'='"Industrie"'::jsonb) then raise exception 'Historique attribut absent.';end if;
 if jsonb_array_length(public.record_field_history(w,r,'display_name'))<>2 or exists(select 1 from jsonb_array_elements(h) e where e->>'field' in ('archived','currency','amount','stage')) then raise exception 'Filtre par champ incorrect.';end if;
 begin perform public.record_field_history(w,r,'id');raise exception 'Champ arbitraire accepté';exception when invalid_parameter_value then null;end;
 update public.records set archived=true where id=r;
 if (select deleted_at is null or deleted_by<>current_setting('relay_test.member')::uuid from public.records where id=r) then raise exception 'Suppression non horodatée.';end if;
 update public.records set deleted_at=now()-interval '90 days' where id=r;
 if (select deleted_at<now()-interval '1 day' from public.records where id=r) then raise exception 'Horodatage modifiable.';end if;
 if public.restore_records(w,array[r])<>1 then raise exception 'Restauration non confirmée.';end if;
 if (select archived or deleted_at is not null from public.records where id=r) then raise exception 'Restauration incorrecte.';end if;
 update public.records set archived=true where id=r;
 begin perform public.purge_records(w,array[r]);raise exception 'Purge autorisée au membre';exception when insufficient_privilege then null;end;
end $member$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay_test.outsider'),'role','authenticated')::text,true);
do $outsider$
declare w uuid:=current_setting('relay_test.workspace')::uuid;r uuid:=current_setting('relay_test.record')::uuid;begin
 begin perform public.record_field_history(w,r);raise exception 'Historique hors espace';exception when insufficient_privilege then null;end;
 begin perform public.restore_records(w,array[r]);raise exception 'Restauration hors espace';exception when insufficient_privilege then null;end;
end $outsider$;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users order by created_at limit 1),'role','authenticated')::text,true);
do $owner$
declare w uuid:=current_setting('relay_test.workspace')::uuid;obj uuid:=current_setting('relay_test.object')::uuid;r uuid:=current_setting('relay_test.record')::uuid;kept uuid;out jsonb;begin
 insert into public.records(workspace_id,object_id,display_name) values(w,obj,'Protégé') returning id into kept;
 insert into public.commitments(workspace_id,record_id,title) values(w,kept,'Preuve conservée');
 update public.records set archived=true where id=kept;
 out:=public.purge_records(w,array[r,kept]);
 if (out->>'purged')::int<>1 or (out->>'kept')::int<>1 then raise exception 'Purge partielle incorrecte: %',out;end if;
 if exists(select 1 from public.records where id=r) or not exists(select 1 from public.records where id=kept) then raise exception 'Purge inexacte.';end if;
end $owner$;
reset role;
do $retention$
declare w uuid:=current_setting('relay_test.workspace')::uuid;obj uuid:=current_setting('relay_test.object')::uuid;old uuid;fresh uuid;begin
 insert into public.records(workspace_id,object_id,display_name,archived) values(w,obj,'Ancien',true) returning id into old;
 insert into public.records(workspace_id,object_id,display_name,archived) values(w,obj,'Récent',true) returning id into fresh;
 alter table public.records disable trigger record_trash_stamp;
 update public.records set deleted_at=now()-interval '31 days' where id=old;
 alter table public.records enable trigger record_trash_stamp;
 perform relay_private.purge_expired_trash(1000);
 if exists(select 1 from public.records where id=old) or not exists(select 1 from public.records where id=fresh) then raise exception 'Rétention de 30 jours incorrecte.';end if;
end $retention$;
rollback;
select '12 contrôles : historique par champ, attributs, filtre, champ refusé, horodatage, intégrité, restauration, droits de purge, isolation, purge partielle, preuves conservées, rétention 30 jours : réussis (ROLLBACK)' as validation;
