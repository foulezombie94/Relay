begin;
do $fixtures$
declare u uuid;v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();deal uuid:=gen_random_uuid();begin
 select id into u from auth.users order by created_at limit 1;if u is null then raise exception 'Un compte Auth est nécessaire.';end if;
 insert into auth.users(id,email,aud,role) values(v,'relay-stages-'||v||'@example.invalid','authenticated','authenticated');
 insert into public.workspaces(id,name,owner_id) values(w,'Relay stages rollback',u);
 insert into public.memberships(workspace_id,user_id,role) values(w,u,'owner'),(w,v,'member');
 insert into public.objects(id,workspace_id,name,slug) values(deal,w,'Ventes test','deals');
 perform set_config('relay_test.workspace',w::text,true);perform set_config('relay_test.deal',deal::text,true);perform set_config('relay_test.member',v::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end $fixtures$;
set local role authenticated;
do $checks$
declare w uuid:=current_setting('relay_test.workspace')::uuid;deal uuid:=current_setting('relay_test.deal')::uuid;p uuid;r uuid;out jsonb;begin
 select id into p from public.pipelines where workspace_id=w;
 if (select stages from public.pipelines where id=p)<>'["Nouveau","Qualification","Proposition","Négociation"]'::jsonb then raise exception 'Étapes par défaut absentes.';end if;
 out:=public.save_pipeline_stages(w,p,1,'Pipeline SaaS','["Découverte","Démo","Contrat"]'::jsonb,'{"Gagné":"Signé"}'::jsonb,'{"Découverte":10,"Démo":40,"Contrat":80,"Gagné":100,"Perdu":0}'::jsonb);
 if (out->'pipeline'->>'version')::int<>2 then raise exception 'Version non incrémentée.';end if;
 insert into public.records(workspace_id,object_id,display_name) values(w,deal,'Vente défaut') returning id into r;
 if (select stage from public.records where id=r)<>'Découverte' then raise exception 'Première étape non appliquée.';end if;
 begin insert into public.records(workspace_id,object_id,display_name,stage) values(w,deal,'Vente invalide','Qualification');raise exception 'Étape inconnue acceptée';exception when invalid_parameter_value then null;end;
 update public.records set stage='Démo' where id=r;
 begin update public.pipelines set stages='["Découverte","Contrat"]' where id=p;raise exception 'Suppression d’étape utilisée acceptée';exception when invalid_parameter_value then null;end;
 begin perform public.save_pipeline_stages(w,p,2,'Pipeline SaaS','["Découverte","Contrat"]'::jsonb,'{}'::jsonb,'{"Découverte":10,"Contrat":80,"Gagné":100,"Perdu":0}'::jsonb);raise exception 'Déplacement manquant accepté';exception when invalid_parameter_value then null;end;
 out:=public.save_pipeline_stages(w,p,2,'Pipeline SaaS','["Découverte","Contrat"]'::jsonb,'{}'::jsonb,'{"Découverte":10,"Contrat":80,"Gagné":100,"Perdu":0}'::jsonb,'{"Démo":"Contrat"}'::jsonb);
 if (out->>'moved')::int<>1 or (select stage from public.records where id=r)<>'Contrat' then raise exception 'Déplacement atomique incorrect.';end if;
 begin perform public.save_pipeline_stages(w,p,2,'X','["A"]'::jsonb,'{}'::jsonb,'{"A":1,"Gagné":100,"Perdu":0}'::jsonb);raise exception 'Version périmée acceptée';exception when invalid_parameter_value then null;end;
 begin update public.pipelines set stages='["Gagné"]',probabilities='{"Gagné":100,"Perdu":0}' where id=p;raise exception 'Étape réservée acceptée';exception when invalid_parameter_value then null;end;
 if jsonb_array_length(public.crm_sales_report(w)->'history'->'calibration')<>2 then raise exception 'Calibration non alignée sur les étapes.';end if;
end $checks$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay_test.member'),'role','authenticated')::text,true);
do $member$
declare w uuid:=current_setting('relay_test.workspace')::uuid;p uuid;begin
 select id into p from public.pipelines where workspace_id=w;
 begin perform public.save_pipeline_stages(w,p,3,'X','["A"]'::jsonb,'{}'::jsonb,'{"A":1,"Gagné":100,"Perdu":0}'::jsonb);raise exception 'Membre autorisé';exception when insufficient_privilege then null;end;
end $member$;
rollback;
select '9 contrôles : étapes par défaut, première étape, étape inconnue, suppression protégée, déplacement atomique, version, réservées, calibration, droits : réussis (ROLLBACK)' as validation;
