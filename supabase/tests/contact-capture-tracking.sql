begin;
do $fixtures$
declare u uuid;w uuid:=gen_random_uuid();people uuid:=gen_random_uuid();companies uuid:=gen_random_uuid();i uuid:=gen_random_uuid();seq uuid:=gen_random_uuid();rec uuid;enr uuid;del uuid;begin
 select id into u from auth.users order by created_at limit 1;if u is null then raise exception 'Un compte Auth est nécessaire.';end if;
 insert into public.workspaces(id,name,owner_id) values(w,'Relay capture rollback',u);
 insert into public.memberships(workspace_id,user_id,role) values(w,u,'owner');
 insert into public.objects(id,workspace_id,name,slug) values(people,w,'Personnes','people'),(companies,w,'Entreprises','companies');
 insert into public.integrations(id,workspace_id,user_id,provider,email,status) values(i,w,u,'gmail','moi@zyliad-test.fr','connected');
 rec:=gen_random_uuid();
 insert into public.records(id,workspace_id,object_id,display_name,email) values(rec,w,people,'Déjà là','deja@client.fr');
 insert into public.sequences(id,workspace_id,name) values(seq,w,'Prospection');
 insert into public.enrollments(workspace_id,sequence_id,record_id,status,user_id) values(w,seq,rec,'active',u) returning id into enr;
 insert into public.sequence_deliveries(workspace_id,enrollment_id,step,status) values(w,enr,0,'sending') returning id into del;
 perform set_config('relay_test.workspace',w::text,true);perform set_config('relay_test.integration',i::text,true);
 perform set_config('relay_test.user',u::text,true);perform set_config('relay_test.delivery',del::text,true);
 perform set_config('relay_test.people',people::text,true);perform set_config('relay_test.companies',companies::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end $fixtures$;
set local role authenticated;
do $capture$
declare w uuid:=current_setting('relay_test.workspace')::uuid;i uuid:=current_setting('relay_test.integration')::uuid;u uuid:=current_setting('relay_test.user')::uuid;person uuid;begin
 insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,sender,sender_email,recipients,direction) values(w,u,i,'m0','email','Avant','a@acme-conseil.fr','a@acme-conseil.fr','{}','inbound');
 if exists(select 1 from public.records where workspace_id=w and email='a@acme-conseil.fr') then raise exception 'Capture active sans consentement.';end if;
 if not public.set_contact_capture(w,'gmail',true) then raise exception 'Activation refusée.';end if;
 insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,sender,sender_email,recipients,direction)
 values(w,u,i,'m1','email','Projet','jean-paul.dupont@acme-conseil.fr','jean-paul.dupont@acme-conseil.fr','{}','inbound'),
       (w,u,i,'m2','email','Relance','moi@zyliad-test.fr','moi@zyliad-test.fr',array['marie@gmail.com','collegue@zyliad-test.fr','no-reply@acme-conseil.fr','deja@client.fr','Jean-Paul.Dupont@acme-conseil.fr'],'outbound');
 select id into person from public.records where workspace_id=w and email='jean-paul.dupont@acme-conseil.fr';
 if person is null or (select display_name from public.records where id=person)<>'Jean-Paul Dupont' then raise exception 'Contact non créé ou mal nommé.';end if;
 if (select count(*) from public.records where workspace_id=w and lower(email)='jean-paul.dupont@acme-conseil.fr')<>1 then raise exception 'Doublon créé.';end if;
 if not exists(select 1 from public.records c join public.record_relations r on r.target_id=c.id and r.source_id=person where c.domain='acme-conseil.fr' and c.display_name='Acme Conseil') then raise exception 'Entreprise non liée.';end if;
 if not exists(select 1 from public.records where workspace_id=w and email='marie@gmail.com' and domain is null) then raise exception 'Destinataire personnel absent.';end if;
 if exists(select 1 from public.records where workspace_id=w and domain='gmail.com') then raise exception 'Messagerie gratuite créée comme entreprise.';end if;
 if exists(select 1 from public.records where workspace_id=w and email in ('collegue@zyliad-test.fr','no-reply@acme-conseil.fr')) then raise exception 'Collègue ou adresse automatique capturé.';end if;
 update public.records set archived=true where email='marie@gmail.com' and workspace_id=w;
 insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,sender,sender_email,recipients,direction) values(w,u,i,'m3','email','Re','marie@gmail.com','marie@gmail.com','{}','inbound');
 if (select count(*) from public.records where workspace_id=w and email='marie@gmail.com')<>1 then raise exception 'Contact supprimé recréé.';end if;
 begin update public.workspaces set capture_excluded_domains=array['pas un domaine'] where id=w;raise exception 'Domaine invalide accepté';exception when invalid_parameter_value then null;end;
 update public.workspaces set track_email_opens=true,track_email_clicks=true where id=w;
end $capture$;
reset role;
set local role service_role;
do $tracking$
declare d uuid:=current_setting('relay_test.delivery')::uuid;t jsonb;token uuid;hit jsonb;begin
 t:=public.email_tracking_prepare(d,array['https://exemple.fr/offre','https://exemple.fr/rdv']);
 token:=(t->>'token')::uuid;
 if token is null or (t->>'opens')::boolean is not true then raise exception 'Préparation du suivi incorrecte: %',t;end if;
 perform public.email_tracking_hit(token,'open');
 perform set_config('relay_test.token',token::text,true);
end $tracking$;
reset role;
do $sent$
declare d uuid:=current_setting('relay_test.delivery')::uuid;token uuid:=current_setting('relay_test.token')::uuid;hit jsonb;begin
 if (select open_count from public.sequence_deliveries where id=d)<>0 then raise exception 'Ouverture comptée avant envoi.';end if;
 update public.sequence_deliveries set status='sent',sent_at=now() where id=d;
 perform public.email_tracking_hit(token,'open');
 perform public.email_tracking_hit(token,'open',null,false);
 hit:=public.email_tracking_hit(token,'click',2);
 if hit->>'url'<>'https://exemple.fr/rdv' then raise exception 'Redirection incorrecte: %',hit;end if;
 if public.email_tracking_hit(token,'click',3) is not null or public.email_tracking_hit(gen_random_uuid(),'click',1) is not null then raise exception 'Redirection arbitraire possible.';end if;
 if (select open_count<>1 or click_count<>1 or first_opened_at is null from public.sequence_deliveries where id=d) then raise exception 'Compteurs incorrects.';end if;
end $sent$;
rollback;
select '14 contrôles : consentement, création, nom, doublon, entreprise liée, messagerie personnelle, collègues, adresses automatiques, corbeille respectée, domaines exclus, suivi préparé, avant envoi, robots ignorés, redirections fermées : réussis (ROLLBACK)' as validation;
