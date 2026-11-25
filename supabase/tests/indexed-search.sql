-- Performance audit P-06: indexed search keeps every RLS rule. A restricted reader sees
-- only granted records, private notes stay private, an outsider gets nothing, anon
-- cannot call the functions. Fixtures roll back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid();reader uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 w uuid;obj uuid;a uuid;b uuid;n bigint;
begin
 insert into auth.users(id,email) values(owner_id,'search-owner@example.test'),(reader,'search-reader@example.test'),(outsider,'search-outsider@example.test');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
 w:=public.create_workspace('Indexed search');
 select id into obj from public.objects where workspace_id=w and slug='companies';
 insert into public.records(workspace_id,object_id,display_name,email) values(w,obj,'Alphabet Granted','granted@alphabet.test') returning id into a;
 insert into public.records(workspace_id,object_id,display_name,email) values(w,obj,'Alphabet Hidden','hidden@alphabet.test') returning id into b;
 insert into public.notes(workspace_id,record_id,title,content,private,author_id) values(w,a,'Plan','codeword confidentiel',true,owner_id);
 insert into public.notes(workspace_id,record_id,title,content,private,author_id) values(w,a,'Public','codeword partagé',false,owner_id);
 insert into public.memberships(workspace_id,user_id,role,display_name,reader_scope) values(w,reader,'viewer','Reader','selected');
 insert into relay_private.reader_record_access(workspace_id,user_id,record_id) values(w,reader,a);

 -- Owner: both records by substring and by full text, both notes.
 execute 'set local role authenticated';
 if (select count(*) from public.records_matching(w,'phabet'))<>2 then raise exception 'Owner substring search incomplete';end if;
 if (select count(*) from public.records_search(w,'alphabet'))<>2 then raise exception 'Owner full-text search incomplete';end if;
 if (select count(*) from public.notes_search(w,'codeword'))<>2 then raise exception 'Owner note search incomplete';end if;
 -- Same rows as the direct RLS query.
 if exists(select id from public.records_matching(w,'phabet') except select id from public.records where workspace_id=w and display_name ilike '%phabet%')
  or exists(select id from public.records where workspace_id=w and display_name ilike '%phabet%' except select id from public.records_matching(w,'phabet'))
  then raise exception 'Indexed substring search differs from the direct query';end if;
 -- Under 3 characters the helper matches nothing: the app keeps the direct query.
 if (select count(*) from public.records_matching(w,'ph'))<>0 then raise exception 'Short term used the trigram helper';end if;
 execute 'reset role';

 -- Restricted reader: only the granted record, never the private note.
 perform set_config('request.jwt.claim.sub',reader::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reader,'role','authenticated','aal','aal2')::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.records_matching(w,'phabet');
 if n<>1 or not exists(select 1 from public.records_matching(w,'phabet') where id=a) then raise exception 'Reader substring search returned % rows',n;end if;
 if exists(select 1 from public.records_search(w,'hidden')) then raise exception 'Reader saw a record outside the grant';end if;
 select count(*) into n from public.notes_search(w,'codeword');
 if n<>1 or exists(select 1 from public.notes_search(w,'confidentiel')) then raise exception 'Private note leaked to the reader (% notes)',n;end if;
 execute 'reset role';

 -- Outsider: nothing, and the helper itself returns no id.
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','aal','aal2')::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from public.records_matching(w,'phabet')) or exists(select 1 from public.notes_search(w,'codeword')) then raise exception 'Outsider found rows';end if;
 if cardinality(relay_private.record_match_ids(w,'phabet'))<>0 or cardinality(relay_private.search_match_ids(w,'notes','codeword'))<>0 then raise exception 'Helper returned ids to an outsider';end if;
 execute 'reset role';

 -- Anonymous callers cannot use any of it.
 execute 'set local role anon';
 begin perform public.records_matching(w,'phabet');raise exception 'anon can call records_matching';exception when insufficient_privilege then null;end;
 begin perform public.notes_search(w,'codeword');raise exception 'anon can call notes_search';exception when insufficient_privilege then null;end;
 execute 'reset role';
 raise notice 'Indexed search: owner, restricted reader, private notes, outsider and anon passed.';
end $$;
rollback;
