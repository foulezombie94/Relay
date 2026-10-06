begin;
create or replace function public.integration_save(w uuid,p text,mail text,encrypted text,permissions text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare i uuid;begin
 if (select auth.uid()) is null or not relay_private.has_role(w,array['owner','admin','member']) or p not in ('google','microsoft') or length(encrypted)>30000 then raise exception 'Forbidden';end if;
 insert into public.integrations(workspace_id,user_id,provider,email,status,scopes) values(w,(select auth.uid()),p,mail,'connected',permissions)
 on conflict(workspace_id,user_id,provider) do update set email=excluded.email,status='connected',scopes=excluded.scopes returning id into i;
 insert into relay_private.integration_secrets(integration_id,encrypted_tokens) values(i,encrypted) on conflict(integration_id) do update set encrypted_tokens=excluded.encrypted_tokens,updated_at=now();
 return i;end $$;
create or replace function public.integration_get(w uuid,p text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'encrypted_tokens',s.encrypted_tokens) from public.integrations i join relay_private.integration_secrets s on s.integration_id=i.id
 where (select auth.uid()) is not null and relay_private.has_role(w) and i.workspace_id=w and i.user_id=(select auth.uid()) and i.provider=p and i.status='connected'
$$;
create or replace function public.integration_disconnect(w uuid,p text) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden';end if;
 delete from relay_private.integration_secrets s using public.integrations i where s.integration_id=i.id and i.workspace_id=w and i.user_id=(select auth.uid()) and i.provider=p;
 update public.integrations set status='disconnected' where workspace_id=w and user_id=(select auth.uid()) and provider=p;
end $$;
revoke all on function public.integration_save(uuid,text,text,text,text[]),public.integration_get(uuid,text),public.integration_disconnect(uuid,text) from public,anon;
grant execute on function public.integration_save(uuid,text,text,text,text[]),public.integration_get(uuid,text),public.integration_disconnect(uuid,text) to authenticated;
commit;
