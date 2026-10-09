begin;
do $fixtures$
declare u uuid;v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();other uuid:=gen_random_uuid();obj uuid:=gen_random_uuid();deal uuid:=gen_random_uuid();begin
 select id into u from auth.users order by created_at limit 1;if u is null then raise exception 'Un compte Auth est nécessaire.';end if;
 insert into auth.users(id,email,aud,role) values(v,'relay-validation-'||v||'@example.invalid','authenticated','authenticated');
 insert into public.workspaces(id,name,owner_id) values(w,'Relay validation rollback',u),(other,'Outside validation rollback',v);
 insert into public.memberships(workspace_id,user_id,role) values(w,u,'owner'),(w,v,'viewer'),(other,v,'owner');
 -- This legacy suite tests note privacy for an explicitly unrestricted reader.
 -- Selected/default-reader denial is covered by reader-visibility.sql.
 update public.memberships set reader_scope='all' where workspace_id=w and user_id=v;
 insert into public.objects(id,workspace_id,name,slug) values(obj,w,'Contacts test','people'),(deal,w,'Ventes test','deals');
 insert into public.notes(workspace_id,title,content,private,author_id) values(w,'relayscope shared','Visible',false,u),(w,'relayscope owner','Privé',true,u),(w,'relayscope other','Invisible',true,v);
 perform set_config('relay_test.workspace',w::text,true);perform set_config('relay_test.other',other::text,true);perform set_config('relay_test.object',obj::text,true);perform set_config('relay_test.deal',deal::text,true);perform set_config('relay_test.user',u::text,true);perform set_config('relay_test.viewer',v::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end $fixtures$;
set local role authenticated;
do $checks$
declare w uuid:=current_setting('relay_test.workspace')::uuid;obj uuid:=current_setting('relay_test.object')::uuid;deal uuid:=current_setting('relay_test.deal')::uuid;p uuid;first_job jsonb;second_job jsonb;rows_data jsonb;amount_before integer;begin
 select id into p from public.pipelines where workspace_id=w;
 if p is null then raise exception 'Pipeline initial absent.';end if;
 if exists(select 1 from public.pipelines where workspace_id=current_setting('relay_test.other')::uuid) then raise exception 'Fuite entre espaces.';end if;
 if (select count(*) from public.notes where workspace_id=w and search_index @@ websearch_to_tsquery('simple','relayscope'))<>2 then raise exception 'Recherche notes privées incorrecte.';end if;
 insert into public.records(workspace_id,object_id,display_name) values(w,deal,'Vente test');
 if (select pipeline_id from public.records where workspace_id=w and object_id=deal)<>p then raise exception 'Pipeline automatique absent.';end if;
 rows_data:=jsonb_build_array(jsonb_build_object('display_name','Import test','email','relay-test@example.invalid'));
 first_job:=public.import_crm_records(w,obj,rows_data,repeat('a',64),'test.csv','{}','skip','[]');
 second_job:=public.import_crm_records(w,obj,rows_data,repeat('a',64),'test.csv','{}','skip','[]');
 if first_job->>'id'<>second_job->>'id' or (second_job->>'replayed')::boolean is not true or (select count(*) from public.records where workspace_id=w and object_id=obj)<>1 then raise exception 'Import non idempotent.';end if;
 second_job:=public.import_crm_records(w,obj,rows_data,repeat('b',64),'test2.csv','{}','skip','[]');
 if (second_job->>'skipped')::int<>1 or (second_job->>'inserted')::int<>0 then raise exception 'Doublon non ignoré.';end if;
 select count(*) into amount_before from public.records where workspace_id=w;
 begin
  perform public.import_crm_records(w,obj,jsonb_build_array(jsonb_build_object('display_name','Should rollback'),jsonb_build_object('email','invalid@example.invalid')),repeat('c',64),'broken.csv','{}','create','[]');
  raise exception 'Expected integrity error not raised';
 exception when not_null_violation then null;end;
 if (select count(*) from public.records where workspace_id=w)<>amount_before or exists(select 1 from public.import_jobs where workspace_id=w and digest=repeat('c',64)) then raise exception 'Import non atomique.';end if;
 insert into public.email_templates(workspace_id,name,subject,body) values(w,'Modèle test','Bonjour {{name}}','Message');
 update public.pipelines set name='Pipeline configuré' where workspace_id=w and id=p;
 if (select version from public.pipelines where id=p)<>2 then raise exception 'Version du pipeline non incrémentée.';end if;
end $checks$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay_test.viewer'),'role','authenticated')::text,true);
do $viewer$
declare w uuid:=current_setting('relay_test.workspace')::uuid;begin
 if (select count(*) from public.notes where workspace_id=w and search_index @@ websearch_to_tsquery('simple','relayscope'))<>2 then raise exception 'Isolation des notes privées du lecteur incorrecte.';end if;
 begin insert into public.email_templates(workspace_id,name,subject,body) values(w,'Interdit','Interdit','Interdit');raise exception 'Write permitted to viewer';exception when insufficient_privilege then null;end;
 begin perform public.import_crm_records(w,current_setting('relay_test.object')::uuid,'[]',repeat('d',64),'viewer.csv','{}','skip','[]');raise exception 'Import permitted to viewer';exception when insufficient_privilege then null;end;
end $viewer$;
rollback;
select '10 contrôles : isolation, recherche privée, pipeline initial, import idempotent, doublons, atomicité, version, modèle, lecteur et permissions : réussis (ROLLBACK)' as validation;
