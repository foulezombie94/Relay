begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
-- The invoker's RLS determines every portal, item, comment and membership read.
create function public.portal_summaries(portal_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if portal_ids is null or cardinality(portal_ids)>50 or array_position(portal_ids,null) is not null then raise exception 'Invalid portal selection' using errcode='22023';end if;
 with visible as materialized (select p.* from public.portals p where p.id=any(portal_ids)),
 items as (select i.portal_id,count(*) as item_count,count(*) filter(where i.type='step') as step_count,
 count(*) filter(where i.type='step' and i.status in ('done','approved')) as completed_steps,
 count(*) filter(where i.type='document' or i.document_id is not null) as document_count,
 count(*) filter(where i.type='decision' and i.status='open') as open_decisions,
 min(i.due_date) filter(where i.status='open') as next_due_at,max(i.created_at) as latest
 from public.portal_items i join visible p on p.id=i.portal_id group by i.portal_id),
 comments as (select c.portal_id,count(*) as comment_count,max(c.created_at) as latest from public.portal_comments c join visible p on p.id=c.portal_id group by c.portal_id)
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'item_count',coalesce(i.item_count,0),
 'step_count',coalesce(i.step_count,0),'completed_steps',coalesce(i.completed_steps,0),
 'document_count',coalesce(i.document_count,0),'open_decisions',coalesce(i.open_decisions,0),
 'comment_count',coalesce(c.comment_count,0),'next_due_at',i.next_due_at,
 'last_activity_at',greatest(p.created_at,i.latest,c.latest),
 'can_comment',p.enabled and (relay_private.portal_access(p.id,true) or exists(select 1 from public.memberships m where m.workspace_id=p.workspace_id and m.user_id=auth.uid() and m.role in ('owner','admin','member')))) order by p.id),'[]')
 into result from visible p left join items i on i.portal_id=p.id left join comments c on c.portal_id=p.id;
 return result;
end $$;
revoke all on function public.portal_summaries(uuid[]) from public,anon;
grant execute on function public.portal_summaries(uuid[]) to authenticated;
create function public.portal_directory(search_text text default '',page_number integer default 0,state_filter text default 'all') returns jsonb
language plpgsql stable security invoker set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if search_text is null or length(search_text)>200 or page_number is null or page_number not between 0 and 10000 or state_filter is null or state_filter not in ('all','active','paused') then raise exception 'Invalid portal filters' using errcode='22023';end if;
 with visible as materialized (select p.* from public.portals p where
 (search_text='' or strpos(lower(p.name),lower(trim(search_text)))>0)
 and (state_filter='all' or p.enabled=(state_filter='active'))),
 page as materialized (select * from visible order by created_at desc,id desc limit 24 offset page_number*24),
 summaries as (select value as data from jsonb_array_elements(public.portal_summaries(coalesce((select array_agg(id) from page),'{}'::uuid[]))))
 select jsonb_build_object('data',coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'name',p.name,'enabled',p.enabled,'created_at',p.created_at,
 'access',case when m.role is null then 'client' else 'team' end,
 'can_manage',coalesce(m.role in ('owner','admin','member'),false),
 'workspace_id',case when m.role is not null then p.workspace_id else null end,
 'summary',s.data) order by p.created_at desc,p.id desc)
 from page p left join public.memberships m on m.workspace_id=p.workspace_id and m.user_id=auth.uid()
 join summaries s on s.data->>'id'=p.id::text),'[]'),
 'count',(select count(*) from visible),'page',page_number,
 'manage_workspace_id',(select workspace_id from public.memberships where user_id=auth.uid() and role in ('owner','admin','member') order by workspace_id limit 1)) into result;
 return result;
end $$;
revoke all on function public.portal_directory(text,integer,text) from public,anon;
grant execute on function public.portal_directory(text,integer,text) to authenticated;
create index portal_items_page_idx on public.portal_items(portal_id,created_at desc,id desc);
create index portal_comments_page_idx on public.portal_comments(portal_id,created_at desc,id desc);
commit;
