begin;
do $fixtures$
declare u uuid;v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();people uuid:=gen_random_uuid();companies uuid:=gen_random_uuid();begin
 select id into u from auth.users order by created_at limit 1;if u is null then raise exception 'Un compte Auth est nécessaire.';end if;
 insert into auth.users(id,email,aud,role) values(v,'relay-enrich-'||v||'@example.invalid','authenticated','authenticated');
 insert into public.workspaces(id,name,owner_id) values(w,'Relay enrichment rollback',u);
 insert into public.memberships(workspace_id,user_id,role) values(w,u,'owner'),(w,v,'viewer');
 insert into public.objects(id,workspace_id,name,slug) values(people,w,'Personnes','people'),(companies,w,'Entreprises','companies');
 perform set_config('relay_test.workspace',w::text,true);perform set_config('relay_test.people',people::text,true);perform set_config('relay_test.companies',companies::text,true);
 perform set_config('relay_test.user',u::text,true);perform set_config('relay_test.viewer',v::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end $fixtures$;
set local role authenticated;
do $enqueue$
declare w uuid:=current_setting('relay_test.workspace')::uuid;c uuid;p uuid;n uuid;begin
 insert into public.records(workspace_id,object_id,display_name,domain) values(w,current_setting('relay_test.companies')::uuid,'Acme','acme.fr') returning id into c;
 insert into public.records(workspace_id,object_id,display_name,email) values(w,current_setting('relay_test.people')::uuid,'Léa','lea@globex.fr') returning id into p;
 insert into public.records(workspace_id,object_id,display_name) values(w,current_setting('relay_test.companies')::uuid,'Sans domaine') returning id into n;
 if (select count(*) from public.record_enrichments where workspace_id=w and status='pending')<>2 then raise exception 'Mise en file incorrecte.';end if;
 begin perform public.request_enrichment(w,n);raise exception 'Fiche sans domaine acceptée';exception when invalid_parameter_value then null;end;
 perform set_config('relay_test.company',c::text,true);perform set_config('relay_test.person',p::text,true);
end $enqueue$;
reset role;
set local role service_role;
do $worker$
declare c jsonb;p uuid:=current_setting('relay_test.person')::uuid;co uuid:=current_setting('relay_test.company')::uuid;begin
 c:=public.enrichment_claim('w1',10);
 if jsonb_array_length(c)<>2 then raise exception 'Réclamation incorrecte: %',c;end if;
 if jsonb_array_length(public.enrichment_claim('w2',10))<>0 then raise exception 'Double réclamation.';end if;
 if public.enrichment_complete(co,'w2','done','{}',array['site'],null)<>'lease_lost' then raise exception 'Lease ignoré.';end if;
 perform public.enrichment_complete(co,'w1','done','{"description":"Conseil","industry":"Information et communication","employees":"20 à 49 salariés"}',array['site','annuaire-entreprises'],null);
 perform public.enrichment_complete(p,'w1','done','{"company_domain":"globex.fr","company_name":"Globex"}',array['email'],null);
end $worker$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay_test.viewer'),'role','authenticated')::text,true);
set local role authenticated;
do $viewer$
declare w uuid:=current_setting('relay_test.workspace')::uuid;begin
 if exists(select 1 from public.record_enrichments where workspace_id=w) then raise exception 'Lecteur limité voit les enrichissements.';end if;
end $viewer$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay_test.user'),'role','authenticated')::text,true);
set local role authenticated;
do $owner$
declare w uuid:=current_setting('relay_test.workspace')::uuid;p uuid:=current_setting('relay_test.person')::uuid;g uuid;begin
 if (select data->>'industry' from public.record_enrichments where record_id=current_setting('relay_test.company')::uuid)<>'Information et communication' then raise exception 'Données absentes.';end if;
 select id into g from public.records where workspace_id=w and domain='globex.fr';
 if g is null or (select display_name from public.records where id=g)<>'Globex' then raise exception 'Entreprise non créée.';end if;
 if not exists(select 1 from public.record_relations where source_id=p and target_id=g and label='Travaille chez') then raise exception 'Personne non rattachée.';end if;
 if not exists(select 1 from public.record_enrichments where record_id=g and status='pending') then raise exception 'Entreprise créée non mise en file.';end if;
 if (select version from public.records where id=current_setting('relay_test.company')::uuid)<>1 then raise exception 'Version de fiche modifiée par l’enrichissement.';end if;
end $owner$;
rollback;
select '10 contrôles : mise en file, refus sans domaine, réclamation, lease, données, entreprise créée, rattachement, chaînage, version intacte, lecteur limité : réussis (ROLLBACK)' as validation;
