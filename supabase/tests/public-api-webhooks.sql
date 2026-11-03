begin;
do $fixtures$
declare u uuid;v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();other uuid:=gen_random_uuid();obj uuid:=gen_random_uuid();oobj uuid:=gen_random_uuid();begin
 select id into u from auth.users order by created_at limit 1;if u is null then raise exception 'Un compte Auth est nécessaire.';end if;
 insert into auth.users(id,email,aud,role) values(v,'relay-api-'||v||'@example.invalid','authenticated','authenticated');
 insert into public.workspaces(id,name,owner_id) values(w,'Relay API rollback',u),(other,'Relay API outside',v);
 insert into public.memberships(workspace_id,user_id,role) values(w,u,'owner'),(w,v,'member'),(other,v,'owner');
 insert into public.objects(id,workspace_id,name,slug) values(obj,w,'Personnes','people'),(oobj,other,'Personnes','people');
 insert into public.attributes(workspace_id,object_id,key,name,type,options) values(w,obj,'secteur','Secteur','select','["SaaS","Industrie"]');
 insert into public.records(workspace_id,object_id,display_name) values(other,oobj,'Hors espace');
 perform set_config('relay_test.workspace',w::text,true);perform set_config('relay_test.object',obj::text,true);
 perform set_config('relay_test.member',v::text,true);perform set_config('relay_test.owner',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end $fixtures$;
set local role authenticated;
do $keys$
declare w uuid:=current_setting('relay_test.workspace')::uuid;k uuid;ro uuid;ep uuid;begin
 k:=public.api_key_create(w,'Intégration',  'zk_Abcd1234',repeat('a',64),array['records:read','records:write','tasks:write','notes:read','webhooks:manage']);
 ro:=public.api_key_create(w,'Lecture','zk_Read1234',repeat('b',64),array['records:read']);
 perform set_config('relay_test.key',k::text,true);perform set_config('relay_test.readonly',ro::text,true);
 begin perform public.api_key_create(w,'Mauvaise','zk_Bad12345',repeat('c',64),array['admin:all']);raise exception 'Scope inconnu accepté';exception when check_violation then null;end;
 ep:=public.webhook_endpoint_create(w,'https://hooks.example.com/zyliad','CRM',array['record.created','record.updated','record.deleted'],null,repeat('s',60));
 perform set_config('relay_test.endpoint',ep::text,true);
end $keys$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay_test.member'),'role','authenticated')::text,true);
do $member$
declare w uuid:=current_setting('relay_test.workspace')::uuid;begin
 if exists(select 1 from public.api_keys where workspace_id=w) then raise exception 'Clés visibles par un membre.';end if;
 begin perform public.api_key_create(w,'Interdit','zk_Memb1234',repeat('d',64),array['records:read']);raise exception 'Membre autorisé';exception when insufficient_privilege then null;end;
 begin perform public.webhook_deliveries_list(w);raise exception 'Livraisons visibles';exception when insufficient_privilege then null;end;
end $member$;
reset role;
set local role service_role;
do $api$
declare w uuid:=current_setting('relay_test.workspace')::uuid;r jsonb;rec uuid;again jsonb;n integer;begin
 r:=public.api_request(repeat('f',64),'me');
 if r->>'error'<>'invalid_key' then raise exception 'Clé inconnue acceptée: %',r;end if;
 r:=public.api_request(repeat('a',64),'me');
 if (r->'workspace'->>'id')::uuid<>w then raise exception 'Espace de la clé incorrect: %',r;end if;
 r:=public.api_request(repeat('a',64),'records.create',jsonb_build_object('object','people','values',jsonb_build_object('display_name','Alice API','email','alice@example.invalid','attributes',jsonb_build_object('secteur','SaaS'))),'req-0000001',repeat('1',64));
 if r ? 'error' then raise exception 'Création refusée: %',r;end if;
 rec:=(r->'data'->>'id')::uuid;perform set_config('relay_test.record',rec::text,true);
 if (select created_by_check from (select (select actor_id from public.audit_events where entity='records' and entity_id=rec and action='insert')=current_setting('relay_test.owner')::uuid as created_by_check) x) is not true then raise exception 'Auteur audit incorrect.';end if;
 again:=public.api_request(repeat('a',64),'records.create',jsonb_build_object('object','people','values',jsonb_build_object('display_name','Alice API')),'req-0000001',repeat('1',64));
 if (again->'data'->>'id')::uuid<>rec or (again->>'replayed')::boolean is not true then raise exception 'Idempotence incorrecte: %',again;end if;
 if public.api_request(repeat('a',64),'records.create','{"object":"people","values":{"display_name":"X"}}','req-0000001',repeat('2',64))->>'error'<>'idempotency_conflict' then raise exception 'Conflit d’idempotence ignoré.';end if;
 if public.api_request(repeat('a',64),'records.create','{"object":"people","values":{"display_name":"X"}}')->>'error'<>'idempotency_key_required' then raise exception 'Clé d’idempotence facultative.';end if;
 r:=public.api_request(repeat('a',64),'records.create',jsonb_build_object('object','people','values',jsonb_build_object('display_name','Mauvais','attributes',jsonb_build_object('secteur','Banque'))),'req-0000002',repeat('3',64));
 if r->>'error'<>'validation_error' then raise exception 'Attribut invalide accepté: %',r;end if;
 r:=public.api_request(repeat('a',64),'records.create',jsonb_build_object('object','people','values',jsonb_build_object('display_name','Z','archived',true)),'req-0000003',repeat('4',64));
 if r->>'error'<>'validation_error' then raise exception 'Champ protégé accepté: %',r;end if;
 r:=public.api_request(repeat('a',64),'records.update',jsonb_build_object('id',rec,'version',99,'values',jsonb_build_object('display_name','Y')),'req-0000004',repeat('5',64));
 if r->>'error'<>'version_conflict' then raise exception 'Version périmée acceptée: %',r;end if;
 r:=public.api_request(repeat('a',64),'records.update',jsonb_build_object('id',rec,'version',1,'values',jsonb_build_object('display_name','Alice Martin','attributes',jsonb_build_object('secteur','Industrie'))),'req-0000005',repeat('6',64));
 if r->'data'->>'display_name'<>'Alice Martin' or (r->'data'->>'version')::int<>2 then raise exception 'Mise à jour incorrecte: %',r;end if;
 r:=public.api_request(repeat('a',64),'records.list','{"object":"people","limit":1}');
 if jsonb_array_length(r->'data')<>1 or exists(select 1 from jsonb_array_elements(r->'data') e where e->>'display_name'='Hors espace') then raise exception 'Liste incorrecte: %',r;end if;
 if public.api_request(repeat('b',64),'records.create','{"object":"people","values":{"display_name":"X"}}','req-0000006',repeat('7',64))->>'error'<>'insufficient_scope' then raise exception 'Scope en écriture ignoré.';end if;
 r:=public.api_request(repeat('a',64),'records.get',jsonb_build_object('id',(select id from public.records where display_name='Hors espace')));
 if r->>'error'<>'not_found' then raise exception 'Fiche hors espace lisible: %',r;end if;
 r:=public.api_request(repeat('a',64),'records.delete',jsonb_build_object('id',rec),'req-0000007',repeat('8',64));
 if (select not archived from public.records where id=rec) then raise exception 'Suppression API absente.';end if;
end $api$;
reset role;
do $outbox$
declare n integer;begin
 select count(*) into n from relay_private.webhook_deliveries where endpoint_id=current_setting('relay_test.endpoint')::uuid;
 if n<>3 then raise exception 'Événements webhook attendus 3, obtenus %',n;end if;
 if not exists(select 1 from relay_private.webhook_deliveries where event_type='record.updated' and payload->'data'->'changes' ? 'display_name') then raise exception 'Changements absents du webhook.';end if;
 update relay_private.api_credentials set request_count=120,window_started_at=now() where key_id=current_setting('relay_test.readonly')::uuid;
 if public.api_request(repeat('b',64),'me')->>'error'<>'rate_limited' then raise exception 'Limite de débit absente.';end if;
end $outbox$;
set local role service_role;
do $delivery$
declare c jsonb;d uuid;s text;begin
 c:=public.webhook_claim('worker-a',10);
 if jsonb_array_length(c)<>3 or c->0->>'sealed' is null then raise exception 'Réclamation incorrecte: %',c;end if;
 if jsonb_array_length(public.webhook_claim('worker-b',10))<>0 then raise exception 'Double réclamation.';end if;
 d:=(c->0->>'id')::uuid;
 if public.webhook_complete(d,'worker-b',true,200,null)<>'lease_lost' then raise exception 'Lease ignoré.';end if;
 if public.webhook_complete(d,'worker-a',false,500,'HTTP 500')<>'retry' then raise exception 'Nouvelle tentative absente.';end if;
 s:=public.webhook_complete((c->1->>'id')::uuid,'worker-a',true,204,null);
 if s<>'delivered' then raise exception 'Livraison non confirmée.';end if;
 perform set_config('relay_test.retry',d::text,true);perform set_config('relay_test.expiring',c->2->>'id',true);
end $delivery$;
reset role;
do $lease$
declare c jsonb;begin
 if (select next_attempt_at<=now() from relay_private.webhook_deliveries where id=current_setting('relay_test.retry')::uuid) then raise exception 'Backoff absent.';end if;
 update relay_private.webhook_deliveries set lease_expires_at=now()-interval '1 second' where id=current_setting('relay_test.expiring')::uuid;
 c:=public.webhook_claim('worker-c',10);
 if jsonb_array_length(c)<>1 or (c->0->>'attempts')::int<>2 then raise exception 'Lease expiré non repris: %',c;end if;
end $lease$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay_test.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $revoke$
declare w uuid:=current_setting('relay_test.workspace')::uuid;begin
 perform public.api_key_revoke(w,current_setting('relay_test.key')::uuid);
 insert into public.notes(workspace_id,title,content,private,author_id) values(w,'Privée','Secret',true,current_setting('relay_test.owner')::uuid);
end $revoke$;
reset role;
do $after$
begin
 if public.api_request(repeat('a',64),'me')->>'error'<>'invalid_key' then raise exception 'Clé révoquée acceptée.';end if;
 if exists(select 1 from relay_private.webhook_deliveries where event_type like 'note.%') then raise exception 'Note privée envoyée.';end if;
end $after$;
rollback;
select '22 contrôles : clés hachées, scopes, droits admin, identité, idempotence, conflits, validation, champs protégés, versions, isolation, débit, événements, changements, leases, backoff, reprise, révocation, notes privées : réussis (ROLLBACK)' as validation;
