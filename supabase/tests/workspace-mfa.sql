begin;
do $fixtures$
declare u uuid;w uuid:=gen_random_uuid();obj uuid:=gen_random_uuid();begin
 select id into u from auth.users order by created_at limit 1;if u is null then raise exception 'Un compte Auth est nécessaire.';end if;
 insert into public.workspaces(id,name,owner_id) values(w,'Relay MFA rollback',u);
 insert into public.memberships(workspace_id,user_id,role) values(w,u,'owner');
 insert into public.objects(id,workspace_id,name,slug) values(obj,w,'Contacts test','people');
 insert into public.records(workspace_id,object_id,display_name) values(w,obj,'Alice');
 perform set_config('relay_test.workspace',w::text,true);perform set_config('relay_test.user',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
end $fixtures$;
set local role authenticated;
do $aal1$
declare w uuid:=current_setting('relay_test.workspace')::uuid;begin
 if (select count(*) from public.records where workspace_id=w)<>1 then raise exception 'Accès aal1 sans exigence refusé.';end if;
 begin update public.workspaces set require_mfa=true where id=w;raise exception 'Exigence activée depuis aal1';exception when invalid_parameter_value then null;end;
end $aal1$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay_test.user'),'role','authenticated','aal','aal2')::text,true);
do $aal2$
declare w uuid:=current_setting('relay_test.workspace')::uuid;begin
 update public.workspaces set require_mfa=true where id=w;
 if (select count(*) from public.records where workspace_id=w)<>1 then raise exception 'Accès aal2 refusé.';end if;
 if jsonb_array_length(public.mfa_blocked_workspaces())<>0 then raise exception 'Espace signalé bloqué en aal2.';end if;
end $aal2$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay_test.user'),'role','authenticated','aal','aal1')::text,true);
do $blocked$
declare w uuid:=current_setting('relay_test.workspace')::uuid;begin
 if exists(select 1 from public.records where workspace_id=w) or exists(select 1 from public.workspaces where id=w) then raise exception 'Données visibles en aal1 malgré l’exigence.';end if;
 if not exists(select 1 from jsonb_array_elements(public.mfa_blocked_workspaces()) e where (e->>'id')::uuid=w) then raise exception 'Espace bloqué non signalé.';end if;
 begin insert into public.objects(workspace_id,name,slug) values(w,'Interdit','forbidden');raise exception 'Écriture aal1 acceptée';exception when insufficient_privilege then null;end;
end $blocked$;
rollback;
select '6 contrôles : accès sans exigence, verrou d’activation, accès aal2, signalement, lecture et écriture bloquées en aal1 : réussis (ROLLBACK)' as validation;
