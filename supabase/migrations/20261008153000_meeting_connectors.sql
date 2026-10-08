begin;
alter table public.meetings add column private boolean not null default false,add column provider_id text,add column integration_id uuid,add column transcript_complete boolean not null default true;
alter table public.meetings add foreign key(workspace_id,integration_id) references public.integrations(workspace_id,id) on delete set null (integration_id);
create unique index meeting_provider_source on public.meetings(workspace_id,author_id,provider,provider_id) where provider_id is not null;
create policy meeting_private on public.meetings as restrictive for all to authenticated using(not private or author_id=auth.uid()) with check(not private or author_id=auth.uid());
alter table public.integrations add column sync_coverage jsonb not null default '{}';
create function relay_private.meeting_privacy() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='UPDATE' and (new.private is distinct from old.private or new.author_id is distinct from old.author_id or new.provider_id is distinct from old.provider_id or (new.integration_id is distinct from old.integration_id and not (new.integration_id is null and not exists(select 1 from public.integrations where id=old.integration_id)))) then raise exception 'Meeting ownership is immutable' using errcode='42501';end if;
 if new.provider_id is not null and (not new.private or new.author_id<>auth.uid()) then raise exception 'Imported meeting must stay private' using errcode='42501';end if;
 return new;end $$;
revoke all on function relay_private.meeting_privacy() from public,anon,authenticated;
create trigger meeting_privacy before insert or update on public.meetings for each row execute function relay_private.meeting_privacy();

-- Extend the existing single-use OAuth guards, preserving their checks/grants.
do $$declare signature text;definition text;begin
 foreach signature in array array['relay_private.integration_oauth_begin(uuid,text,text)','relay_private.integration_save(uuid,text,text,text,text[],text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('''gmail'', ''google-calendar'', ''outlook'', ''outlook-calendar''' in definition)=0 and position('''gmail'',''google-calendar'',''outlook'',''outlook-calendar''' in definition)=0 then raise exception 'OAuth provider guard has changed';end if;
  definition:=replace(definition,'''gmail'', ''google-calendar'', ''outlook'', ''outlook-calendar''','''gmail'', ''google-calendar'', ''outlook'', ''outlook-calendar'', ''google-meet'', ''microsoft-teams'', ''zoom''');
  definition:=replace(definition,'''gmail'',''google-calendar'',''outlook'',''outlook-calendar''','''gmail'',''google-calendar'',''outlook'',''outlook-calendar'',''google-meet'',''microsoft-teams'',''zoom''');
  execute definition;
 end loop;
end $$;

create function relay_private.meeting_sync_finish(w uuid,p text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare integration public.integrations;state relay_private.connector_sync_state;item jsonb;result jsonb;n integer:=0;begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) or p not in ('google-meet','microsoft-teams','zoom') then raise exception 'Forbidden' using errcode='42501';end if;
 select * into integration from public.integrations where workspace_id=w and user_id=auth.uid() and provider=p and status='connected' for update;
 if integration.id is null then raise exception 'Integration revoked' using errcode='42501';end if;
 select * into state from relay_private.connector_sync_state where integration_id=integration.id for update;
 if state.lease is distinct from (payload->>'lease')::uuid or state.leased_until<=now() then raise exception 'Synchronization lease expired' using errcode='40001';end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items')>10 or octet_length(payload::text)>3000000 then raise exception 'Invalid meeting batch' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(payload->'items') loop
  if nullif(item->>'provider_id','') is null or length(item->>'provider_id')>2000 or length(item->>'title')>300 or length(item->>'transcript')>200000 or item->>'transcript' is null then raise exception 'Invalid meeting content' using errcode='22023';end if;
  insert into public.meetings(workspace_id,author_id,provider,provider_id,integration_id,title,starts_at,transcript,transcript_complete,private)
   values(w,auth.uid(),p,item->>'provider_id',integration.id,item->>'title',(item->>'starts_at')::timestamptz,item->>'transcript',(item->>'transcript_complete')::boolean,true)
   on conflict(workspace_id,author_id,provider,provider_id) where provider_id is not null do update set title=excluded.title,starts_at=excluded.starts_at,transcript=case when meetings.transcript_complete and not excluded.transcript_complete then meetings.transcript else excluded.transcript end,transcript_complete=meetings.transcript_complete or excluded.transcript_complete;
  n:=n+1;
 end loop;
 result:=relay_private.connector_sync(w,p,'finish',(payload-'items')||jsonb_build_object('items','[]'::jsonb));
 update relay_private.connector_sync_state set imported=imported+n where integration_id=integration.id;
 update public.integrations set sync_coverage=jsonb_build_object('since',payload->>'window_start','until',payload->>'window_end','partial',coalesce((payload->>'coverage_partial')::boolean,false),'scope','Available provider transcripts only; no recording bot; imported content may be bounded.') where id=integration.id;
 return result||jsonb_build_object('synced',n,'partial',coalesce((payload->>'coverage_partial')::boolean,false));
end $$;
create function public.meeting_sync_finish(w uuid,p text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select relay_private.meeting_sync_finish(w,p,payload)$$;
revoke all on function relay_private.meeting_sync_finish(uuid,text,jsonb),public.meeting_sync_finish(uuid,text,jsonb) from public,anon;
grant execute on function relay_private.meeting_sync_finish(uuid,text,jsonb),public.meeting_sync_finish(uuid,text,jsonb) to authenticated;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.integration_worker(uuid,text,uuid,text,jsonb)'::regprocedure);
 if position('when ''connector_sync''' in lower(definition))=0 then raise exception 'Worker operation guard changed';end if;
 definition:=replace(definition,'when ''connector_sync''', 'when ''meeting_sync_finish'' then return relay_private.meeting_sync_finish(w,p,coalesce(payload->''payload'',''{}'')); when ''connector_sync''');
 execute definition;
end $$;

-- Quotes are checked against fresh authorized content, including passages read
-- through several offsets. A model-supplied citation is never trusted by itself.
create function public.agent_validate_quote(w uuid,kind text,source uuid,quote text) returns boolean language plpgsql stable security invoker set search_path='' as $$declare yes boolean;begin
 if auth.uid() is null or not relay_private.has_role(w) or quote is null or length(trim(quote)) not between 1 and 2000 then return false;end if;
 case kind
 when 'note' then select position(quote in content)>0 into yes from public.notes where workspace_id=w and id=source;
 when 'meeting' then select position(quote in coalesce(nullif(transcript,''),summary))>0 into yes from public.meetings where workspace_id=w and id=source;
 when 'document' then select position(quote in text_content)>0 into yes from public.documents where workspace_id=w and id=source;
 when 'email' then select position(quote in body)>0 into yes from public.communications where workspace_id=w and id=source and communications.kind='email';
 else return false;end case;
 return coalesce(yes,false);
end $$;
revoke all on function public.agent_validate_quote(uuid,text,uuid,text) from public,anon;
grant execute on function public.agent_validate_quote(uuid,text,uuid,text) to authenticated;
create function public.agent_sources_private(w uuid,refs jsonb) returns boolean language plpgsql stable security invoker set search_path='' as $$declare item jsonb;yes boolean;begin
 if auth.uid() is null or not relay_private.has_role(w) or jsonb_typeof(refs)<>'array' or jsonb_array_length(refs)>600 then raise exception 'Forbidden' using errcode='42501';end if;
 for item in select value from jsonb_array_elements(refs) loop
  case item->>'type'
  when 'email','calendar' then return true;
  when 'note' then select private into yes from public.notes where workspace_id=w and id=(item->>'id')::uuid;
  when 'meeting' then select private into yes from public.meetings where workspace_id=w and id=(item->>'id')::uuid;
  when 'commitment' then select private into yes from public.commitments where workspace_id=w and id=(item->>'id')::uuid;
  when 'conflict' then select private into yes from public.conflicts where workspace_id=w and id=(item->>'id')::uuid;
  when 'list' then select visibility='private' into yes from public.lists where workspace_id=w and id=(item->>'id')::uuid;
  else yes:=false;end case;
  if yes then return true;end if;
 end loop;return false;
end $$;
revoke all on function public.agent_sources_private(uuid,jsonb) from public,anon;
grant execute on function public.agent_sources_private(uuid,jsonb) to authenticated;
commit;
