begin;
do $fixtures$
declare u uuid;v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();other uuid:=gen_random_uuid();begin
 select id into u from auth.users order by created_at limit 1;if u is null then raise exception 'Un compte Auth est nécessaire.';end if;
 insert into auth.users(id,email,aud,role) values(v,'relay-billing-'||v||'@example.invalid','authenticated','authenticated');
 insert into public.workspaces(id,name,owner_id) values(w,'Relay billing rollback',u),(other,'Relay billing other',u);
 insert into public.memberships(workspace_id,user_id,role) values(w,u,'owner'),(w,v,'member'),(other,u,'owner');
 perform set_config('relay_test.workspace',w::text,true);perform set_config('relay_test.other',other::text,true);perform set_config('relay_test.member',v::text,true);
end $fixtures$;
set local role service_role;
do $billing$
declare w uuid:=current_setting('relay_test.workspace')::uuid;o uuid:=current_setting('relay_test.other')::uuid;r jsonb;begin
 r:=public.billing_customer(w,'cus_Test123');
 if r->>'customer'<>'cus_Test123' or (r->>'seats')::int<>2 then raise exception 'Client incorrect: %',r;end if;
 if public.billing_customer(w,'cus_Other999')->>'customer'<>'cus_Test123' then raise exception 'Client remplacé.';end if;
 if public.billing_apply('evt_1','customer.subscription.created',now()-interval '1 minute',w,'cus_Test123','sub_A1','pro','active',2,now()+interval '1 month',false,null)<>'applied' then raise exception 'Événement non appliqué.';end if;
 if public.billing_apply('evt_1','customer.subscription.created',now(),w,'cus_Test123','sub_A1','pro','active',2,null,false,null)<>'duplicate' then raise exception 'Doublon appliqué.';end if;
 if public.billing_apply('evt_0','customer.subscription.updated',now()-interval '1 hour',w,'cus_Test123','sub_A1','business','active',9,null,false,null)<>'stale' then raise exception 'Événement ancien appliqué.';end if;
 if public.billing_apply('evt_2','customer.subscription.created',now(),o,'cus_Test123','sub_B1','pro','active',1,null,false,null)<>'customer_conflict' then raise exception 'Client déplacé.';end if;
 if jsonb_array_length(public.billing_seat_drift())<>0 then raise exception 'Écart de sièges inattendu.';end if;
end $billing$;
reset role;
insert into public.memberships(workspace_id,user_id,role) select current_setting('relay_test.other')::uuid,current_setting('relay_test.member')::uuid,'viewer';
set local role service_role;
do $drift$
declare w uuid:=current_setting('relay_test.workspace')::uuid;begin
 perform public.billing_apply('evt_3','customer.subscription.updated',now(),w,'cus_Test123','sub_A1','pro','active',5,null,false,null);
 if (public.billing_seat_drift()->0->>'billable')::int<>2 then raise exception 'Écart de sièges non détecté.';end if;
end $drift$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay_test.member'),'role','authenticated')::text,true);
set local role authenticated;
do $member$
declare w uuid:=current_setting('relay_test.workspace')::uuid;begin
 if exists(select 1 from public.workspace_subscriptions where workspace_id=w) then raise exception 'Abonnement visible par un membre.';end if;
 if public.workspace_plan(w)->>'plan'<>'pro' then raise exception 'Offre invisible pour le membre.';end if;
 begin perform public.billing_apply('evt_9','x',now(),w,null,null,'business','active',1,null,false,null);raise exception 'Écriture client autorisée';exception when insufficient_privilege then null;end;
end $member$;
rollback;
select '9 contrôles : client unique, idempotence, ordre des événements, client non déplacé, sièges, écart, confidentialité, offre visible, écriture refusée : réussis (ROLLBACK)' as validation;
