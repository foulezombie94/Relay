-- Searches typed without accents find accented records and notes (and the reverse);
-- plural and singular match in full text; RLS still applies. Fixtures roll back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid();reader uuid:=gen_random_uuid();w uuid;obj uuid;a uuid;b uuid;n bigint;
begin
 insert into auth.users(id,email) values(owner_id,'accent-owner@example.test'),(reader,'accent-reader@example.test');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
 w:=public.create_workspace('Accents');
 select id into obj from public.objects where workspace_id=w and slug='companies';
 insert into public.records(workspace_id,object_id,display_name,domain) values(w,obj,'Société Générale','societegenerale.example') returning id into a;
 insert into public.records(workspace_id,object_id,display_name) values(w,obj,'Crédit Hélvétique') returning id into b;
 insert into public.records(workspace_id,object_id,display_name) values(w,obj,'Societe Sans Accent');
 insert into public.notes(workspace_id,record_id,title,content,private,author_id) values(w,a,'Réunion','Échéance du contrat à négocier',false,owner_id);
 insert into public.notes(workspace_id,record_id,title,content,private,author_id) values(w,b,'Privée','échéance confidentielle',true,owner_id);
 insert into public.memberships(workspace_id,user_id,role,display_name,reader_scope) values(w,reader,'viewer','Reader','selected');
 insert into relay_private.reader_record_access(workspace_id,user_id,record_id) values(w,reader,a);

 execute 'set local role authenticated';
 -- Substring lookup, both directions.
 if (select count(*) from public.records_matching(w,'societe'))<>2 then raise exception 'societe did not find both companies';end if;
 if (select count(*) from public.records_matching(w,'SOCIÉTÉ'))<>2 then raise exception 'SOCIÉTÉ did not find both companies';end if;
 if (select count(*) from public.records_matching(w,'helvetique'))<>1 then raise exception 'helvetique did not find Hélvétique';end if;
 -- Full text: accents, case and plural.
 if (select count(*) from public.records_search(w,'societe'))<>2 then raise exception 'Full text societe failed';end if;
 if (select count(*) from public.records_search(w,'sociétés'))<>2 then raise exception 'Plural sociétés failed';end if;
 if (select count(*) from public.notes_search(w,'echeance'))<>2 then raise exception 'Notes echeance failed for the owner';end if;
 if (select count(*) from public.notes_search(w,'negociation'))<>1 then raise exception 'Note stemming failed (négocier vs negociation)';end if;
 execute 'reset role';

 -- The restricted reader still sees only the granted record and no private note.
 perform set_config('request.jwt.claim.sub',reader::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reader,'role','authenticated','aal','aal2')::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.records_matching(w,'societe');
 if n<>1 or not exists(select 1 from public.records_matching(w,'societe') where id=a) then raise exception 'Reader saw % records',n;end if;
 if (select count(*) from public.notes_search(w,'echeance'))<>1 then raise exception 'Private note leaked to the reader';end if;
 execute 'reset role';
 raise notice 'Accent-insensitive search: substring, full text, plural, RLS passed.';
end $$;
rollback;
