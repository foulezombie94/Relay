begin;
do $$
declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();b uuid:=gen_random_uuid();w uuid;other uuid;obj uuid;rec uuid;d uuid;e uuid;i uuid;p uuid;r jsonb;t jsonb;cursor uuid;
begin
 insert into auth.users(id,email) values(u,'dash-owner@example.test'),(v,'dash-viewer@example.test'),(b,'dash-other@example.test');
 perform set_config('request.jwt.claim.sub',u::text,true);
 w:=public.create_workspace('Dashboard A');
 select id into obj from public.objects where workspace_id=w and slug='deals';
 insert into public.memberships(workspace_id,user_id,role,display_name) values(w,v,'viewer','Viewer');
 insert into public.records(workspace_id,object_id,display_name,amount,currency,stage,probability)
 values(w,obj,'EUR open',100,'EUR','Qualification',25) returning id into rec;
 insert into public.records(workspace_id,object_id,display_name,amount,currency,stage)
 values(w,obj,'USD open',200,'USD','Proposition'),(w,obj,'EUR won',300,'EUR','Gagné');
 insert into public.records(workspace_id,object_id,display_name) select w,obj,'Bounded '||n from generate_series(1,52) n;
 insert into public.tasks(workspace_id,title,status) values(w,'Done','done'),(w,'Open','open'),(w,'Cancelled','cancelled');
 insert into public.integrations(workspace_id,user_id,provider,email,status) values(w,u,'gmail','dash-owner@example.test','connected') returning id into i;
 insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,body,received_at)
 values(w,u,i,'dash-private','email','Private mail','Private body',now());
 insert into public.report_dashboards(workspace_id,creator_id,name,visibility,config) values(w,u,'Private','private','[{"title":"Count","kind":"record"}]') returning id into d;
 insert into public.report_dashboards(workspace_id,creator_id,name,visibility,config) values(w,u,'Shared','workspace','[{"title":"Count","kind":"record"}]') returning id into e;
 perform set_config('request.jwt.claim.sub',b::text,true);
 other:=public.create_workspace('Dashboard B');
 perform set_config('request.jwt.claim.sub',u::text,true);
 execute 'set local role authenticated';
 r:=public.dashboard_aggregate(w,'record');
 if (r->>'total')::integer<>55 then raise exception 'Full record count failed %',r;end if;
 r:=public.dashboard_aggregate(w,'record','{}','stage','amount');
 if jsonb_array_length(r->'totals')<>2 then raise exception 'Currencies combined %',r;end if;
 if not exists(select 1 from jsonb_array_elements(r->'totals') x where x->>'currency'='EUR' and (x->>'value')::numeric=400) then raise exception 'Exact EUR total failed %',r;end if;
 r:=public.dashboard_aggregate(w,'record','{"currency":"USD"}','none','weighted_amount');
 if (r->'totals'->0->>'value')::numeric<>100 then raise exception 'Weighted forecast failed %',r;end if;
 r:=public.dashboard_aggregate(w,'task','{}','none','completion_rate');
 if (r->'totals'->0->>'value')::numeric<>50 then raise exception 'Cancelled denominator failed %',r;end if;
 r:=public.dashboard_aggregate(w,'email');
 if (r->>'total')::integer<>1 then raise exception 'Own email inaccessible %',r;end if;
 r:=public.dashboard_aggregate(w,'record','{"empty":true}');
 if (r->>'total')::integer<>0 then raise exception 'AND empty scope failed';end if;
 r:=public.dashboard_aggregate(w,'record','{}','none','avg_stage_days');
 r:=public.dashboard_aggregate(w,'record','{}','stage','stage_reached');
 r:=public.dashboard_aggregate(w,'record','{}','none','avg_cycle_days');
 r:=public.dashboard_aggregate(w,'record','{}','month','count','closed');
 r:=public.dashboard_aggregate(w,'record','{}','owner');
 r:=public.dashboard_aggregate(w,'record','{}','pipeline');
 r:=public.dashboard_aggregate(w,'meeting','{}','provider');
 r:=public.dashboard_aggregate(w,'commitment','{}','status');
 r:=public.dashboard_details(w,'record');
 if jsonb_array_length(r->'data')<>50 or (r->>'total')::integer<>55 or r->>'partial'<>'true' then raise exception 'Bounded details failed %',r;end if;
 cursor:=(r->>'next_cursor')::uuid;
 t:=public.dashboard_details(w,'record','{}','none','count','created',null,null,cursor);
 if jsonb_array_length(t->'data')<>5 or (t->>'total')::integer<>55 then raise exception 'Pagination failed %',t;end if;
 if exists(select 1 from jsonb_array_elements(r->'data') a join jsonb_array_elements(t->'data') page_b on a->>'id'=page_b->>'id') then raise exception 'Duplicate page';end if;
 -- New presentation types reuse the JSON configuration and bounded invoker reads.
 update public.tasks set due_date='2026-10-12T10:00:00Z' where workspace_id=w and title='Open';
 r:=public.dashboard_details(w,'task','{"since":"2026-10-01T00:00:00Z","until":"2026-11-01T00:00:00Z"}','none','count','due');
 if (r->>'total')::integer<>1 or r->'data'->0->>'title'<>'Open' or (r->'data'->0->>'occurred_at')::timestamptz<>'2026-10-12T10:00:00Z'::timestamptz then raise exception 'Calendar due-date scope failed %',r;end if;
 r:=public.dashboard_details(w,'task','{"empty":true}','none','count','due');
 if (r->>'total')::integer<>0 then raise exception 'Conflicting calendar/global period failed %',r;end if;
 r:=public.dashboard_details(w,'email');
 if exists(select 1 from jsonb_array_elements(r->'data') x where x ? 'body' or x ? 'access_token' or x ? 'user_id') then raise exception 'Widget sources exposed private contents';end if;
 insert into public.report_dashboards(workspace_id,creator_id,name,visibility,config,settings)
 values(w,u,'Composable views','private','[{"title":"Board","kind":"record","visual":"board","group_by":"stage","metric":"count","size":"third","height":"tall"},{"title":"Calendar","kind":"task","visual":"calendar","group_by":"none","metric":"count","date_field":"due"},{"title":"Notes","kind":"record","visual":"text","content":"Team context"},{"title":"Links","kind":"record","visual":"links","links":[{"label":"Contacts","href":"/app/people"}]}]','{"period":"all","compare":true,"refresh_seconds":0,"cover":"lavender"}');
 if not exists(select 1 from public.report_dashboards where workspace_id=w and name='Composable views' and config->0->>'size'='third' and settings->>'cover'='lavender') then raise exception 'New configuration did not round-trip';end if;
 begin perform public.dashboard_aggregate(other,'record');raise exception 'Workspace leak';exception when insufficient_privilege then null;end;
 begin perform public.dashboard_aggregate(w,'record','{"sql":"select 1"}');raise exception 'SQL filter allowed';exception when invalid_parameter_value then null;end;
 begin perform public.dashboard_aggregate(w,'record','{}','stage;drop table records');raise exception 'SQL dimension allowed';exception when invalid_parameter_value then null;end;
 begin update public.report_dashboards set creator_id=v where id=d;raise exception 'Owner mutation allowed';exception when insufficient_privilege then null;end;
 perform public.dashboard_preference(w,d,'home',true);perform public.dashboard_preference(w,e,'home',true);
 if (select count(*) from public.dashboard_preferences where workspace_id=w and home)<>1 then raise exception 'Home uniqueness failed';end if;
 perform set_config('request.jwt.claim.sub',v::text,true);
 if exists(select 1 from public.report_dashboards where id=d) then raise exception 'Private dashboard leaked';end if;
 r:=public.dashboard_aggregate(w,'email');
 if (r->>'total')::integer<>0 then raise exception 'Private email leaked %',r;end if;
 perform public.dashboard_preference(w,e,'favorite',true);
 if not exists(select 1 from public.dashboard_preferences where dashboard_id=e and favorite) then raise exception 'Viewer preference failed';end if;
 begin perform public.dashboard_preference(w,d,'favorite',true);raise exception 'Private preference accepted';exception when insufficient_privilege then null;end;
 update public.report_dashboards set name='Forbidden' where id=e;
 if exists(select 1 from public.report_dashboards where id=e and name='Forbidden') then raise exception 'Viewer mutation permitted';end if;
 execute 'reset role';
 delete from public.memberships where workspace_id=w and user_id=v;
 execute 'set local role authenticated';
 begin perform public.dashboard_aggregate(w,'record');raise exception 'Revoked member accessed data';exception when insufficient_privilege then null;end;
 raise notice 'PASS dashboards: real SQL aggregation, currency separation, current RLS, private emails, revoked permissions, pagination, injection rejection and preferences';
end $$;
rollback;

