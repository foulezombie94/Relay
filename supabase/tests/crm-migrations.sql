begin;
-- This integration suite never retains records, users, jobs or schema changes.
set local statement_timeout='30s';
create temporary table migration_checks(label text);
do $$
declare u uuid;w uuid;other uuid;c uuid;p uuid;d uuid;out jsonb;out2 jsonb;firstperson uuid;count_before integer;
begin
 select id into u from auth.users order by created_at limit 1;
 if u is null then raise exception 'Auth account required';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 w:=public.create_workspace('CRM migration rollback test');other:=public.create_workspace('Unrelated rollback test');
 select id into c from public.objects where workspace_id=w and slug='companies';
 select id into p from public.objects where workspace_id=w and slug='people';
 select id into d from public.objects where workspace_id=w and slug='deals';
 out:=public.import_crm_records(w,p,'[{"display_name":"Ada","email":"ada@example.invalid","_import":{"source":"hubspot:test","id":"p1","companies":["c1"]}}]',repeat('a',64),'people.csv','{}','skip','[]');
 if (out->>'inserted')::int<>1 or (out->>'pending')::int<>1 then raise exception 'Missing pending association: %',out;end if;
 firstperson:=(select record_id from relay_private.crm_import_keys where workspace_id=w and source='hubspot:test' and object_id=p and external_id='p1');
 out:=public.import_crm_records(other,c,'[{"display_name":"Wrong tenant"}]',repeat('b',64),'companies.csv','{}','skip','[]');
 -- Object ownership mismatch must be refused, even for a member of both tenants.
 raise exception 'Foreign object accepted';
exception when insufficient_privilege then
 insert into migration_checks values('tenant/object isolation');
end $$;
do $$
declare u uuid;w uuid;other uuid;c uuid;p uuid;out jsonb;out2 jsonb;firstperson uuid;n integer;
begin
 select id into u from auth.users order by created_at limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 w:=public.create_workspace('CRM import isolated fixture');other:=public.create_workspace('CRM import separate fixture');
 select id into c from public.objects where workspace_id=w and slug='companies';select id into p from public.objects where workspace_id=w and slug='people';
 out:=public.import_crm_records(w,p,'[{"display_name":"Ada","email":"ada@example.invalid","_import":{"source":"hubspot:test","id":"p1","companies":["c1"]}}]',repeat('a',64),'people.csv','{}','skip','[]');
 if (out->>'inserted')::int<>1 or (out->>'pending')::int<>1 then raise exception 'Missing pending association: %',out;end if;
 out:=public.import_crm_records(w,c,'[{"display_name":"Acme","domain":"acme.example","_import":{"source":"hubspot:other","id":"c1"}}]',repeat('b',64),'companies.csv','{}','skip','[]');
 if (select count(*) from public.record_relations where workspace_id=w)<>0 then raise exception 'Cross-lot association';end if;
 out:=public.import_crm_records(w,c,'[{"display_name":"Acme","domain":"acme.example","_import":{"source":"hubspot:test","id":"c1"}}]',repeat('c',64),'companies.csv','{}','skip','[]');
 if (out->>'skipped')::int<>1 or (out->>'linked')::int<>1 or (out->>'pending')::int<>0 then raise exception 'Relation resolution or duplicate linking failed: %',out;end if;
 out2:=public.import_crm_records(w,c,'[{"display_name":"Acme","domain":"acme.example","_import":{"source":"hubspot:test","id":"c1"}}]',repeat('c',64),'companies.csv','{}','skip','[]');
 if not (out2->>'replayed')::boolean then raise exception 'Replay not idempotent';end if;
 out:=public.import_crm_records(w,c,'[{"display_name":"Overwrite prohibited","domain":"changed.example","_import":{"source":"hubspot:test","id":"c1"}}]',repeat('d',64),'companies.csv','{}','create','[]');
 if (out->>'skipped')::int<>1 or exists(select 1 from public.records where workspace_id=w and display_name='Overwrite prohibited') then raise exception 'Source identity overwritten or duplicated';end if;
 select count(*) into n from public.records where workspace_id=w;
 begin
  perform public.import_crm_records(w,c,'[{"display_name":"Must roll back"},{"display_name":"Bad meta","_import":{"source":"hubspot:test","id":"x","companies":[42]}}]',repeat('e',64),'bad.csv','{}','skip','[]');
  raise exception 'Malformed association accepted';
 exception when invalid_parameter_value then null;end;
 if (select count(*) from public.records where workspace_id=w)<>n then raise exception 'Partial import committed';end if;
 begin
  perform public.import_crm_records(w,c,'[{"display_name":"Bad actor"}]',repeat('f',64),'bad.csv','{}','skip','[]');
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  perform public.import_crm_records(w,c,'[{"display_name":"Forbidden"}]',repeat('0',64),'forbidden.csv','{}','skip','[]');
  raise exception 'Non-member accepted';
 exception when insufficient_privilege then null;end;
 insert into migration_checks values('pending links resolve only in same migration lot'),('source identity cannot overwrite or duplicate records'),('atomic rollback on invalid associations'),('replay is idempotent'),('non-member denied');
end $$;
select label from migration_checks;

rollback;
