begin;
do $$
declare
 u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();reader uuid:=gen_random_uuid();w uuid;obj uuid;i uuid;r jsonb;
 q jsonb:='{"kind":"record","metric":"count"}';original_expiry timestamptz;
begin
 insert into auth.users(id,email) values(u,'cache-owner@example.test'),(v,'cache-member@example.test'),(reader,'cache-reader@example.test');
 perform set_config('request.jwt.claim.sub',u::text,true);
 w:=public.create_workspace('Cache isolation');
 select id into obj from public.objects where workspace_id=w and slug='people';
 insert into public.memberships(workspace_id,user_id,role,reader_scope) values(w,v,'member','all'),(w,reader,'viewer','selected');
 insert into public.records(workspace_id,object_id,display_name) values(w,obj,'Visible to full members'),(w,obj,'Also visible');
 insert into public.integrations(workspace_id,user_id,provider,email,status) values(w,u,'gmail','cache-owner@example.test','connected') returning id into i;
 insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,received_at) values(w,u,i,'cache-inbound','email','Private email',now());
 execute 'set local role authenticated';
 r:=public.dashboard_batch(w,jsonb_build_array(q));
 if (r->0->'result'->>'total')::int<>2 then raise exception 'Incorrect shared total';end if;
 select expires_at into original_expiry from relay_private.crm_record_aggregate_cache where workspace_id=w;
 perform set_config('request.jwt.claim.sub',v::text,true);
 r:=public.dashboard_batch(w,jsonb_build_array(q));
 if (r->0->'result'->>'total')::int<>2 or (select count(*) from relay_private.crm_record_aggregate_cache where workspace_id=w)<>1 then raise exception 'Full members did not reuse one aggregate';end if;
 if (select expires_at from relay_private.crm_record_aggregate_cache where workspace_id=w) is distinct from original_expiry then raise exception 'Cache hit recomputed aggregate';end if;

 -- Even direct authenticated SQL writes cannot inject forged totals or a long TTL.
 update relay_private.crm_record_aggregate_cache set value='{"result":{"total":999999}}',revision=-1,expires_at=now()+interval '1 year' where workspace_id=w;
 if (select (value->'result'->>'total')::int from relay_private.crm_record_aggregate_cache where workspace_id=w)<>2
 or (select expires_at from relay_private.crm_record_aggregate_cache where workspace_id=w)>now()+interval '21 seconds' then raise exception 'Forged cache value or expiry accepted';end if;
 begin
  update relay_private.crm_record_aggregate_cache set request='{"kind":"email","metric":"count"}' where workspace_id=w;
  raise exception 'Private source accepted by shared cache';
 exception when invalid_parameter_value then null;end;

 if (public.dashboard_batch(w,'[{"kind":"email","metric":"count"}]')->0->'result'->>'total')::int<>0 then raise exception 'Owner email aggregate leaked to member';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 if (public.dashboard_batch(w,'[{"kind":"email","metric":"count"}]')->0->'result'->>'total')::int<>1 then raise exception 'Owner email aggregate missing';end if;
 execute 'reset role';
 if (select count(distinct user_id) from relay_private.crm_aggregate_cache where workspace_id=w)<>2 then raise exception 'Email caches were shared across users';end if;

 perform set_config('request.jwt.claim.sub',reader::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from relay_private.crm_record_aggregate_cache where workspace_id=w) then raise exception 'Selected reader can read shared full-scope statistics';end if;
 begin perform relay_private.shared_record_aggregate(w,q);raise exception 'Selected reader can invoke full-scope cache';exception when insufficient_privilege then null;end;
 begin
  insert into relay_private.crm_record_aggregate_cache(workspace_id,cache_key,request,revision,expires_at,value) values(w,md5(q::text),q,0,now(),'{}');
  raise exception 'Selected reader can write full-scope cache';
 exception when insufficient_privilege then null;end;
 if (public.dashboard_batch(w,jsonb_build_array(q))->0->'result'->>'total')::int<>0 then raise exception 'Selected reader inherited member cache';end if;
 execute 'reset role';
 update public.memberships set role='viewer',reader_scope='selected' where workspace_id=w and user_id=v;
 perform set_config('request.jwt.claim.sub',v::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from relay_private.crm_record_aggregate_cache where workspace_id=w)
 or (public.dashboard_batch(w,jsonb_build_array(q))->0->'result'->>'total')::int<>0 then raise exception 'Revoked full scope reused shared cache';end if;
 raise notice 'Shared cache: reuse, forged values, private emails, restricted readers and revoked scope passed';
end $$;
rollback;
