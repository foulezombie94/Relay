-- Automatic contact capture from synchronized mail/calendar, and open/click
-- tracking of sequence emails. Both are opt-in: capture per connected
-- mailbox (its owner decides), tracking per workspace (administrators).
begin;
set local lock_timeout='5s';

-- ---------------------------------------------------------- Contact capture
alter table public.integrations add column capture_contacts boolean not null default false;
alter table public.workspaces add column capture_excluded_domains text[] not null default '{}'
 check(cardinality(capture_excluded_domains)<=200);
create index records_domain_lookup_idx on public.records(workspace_id,lower(domain)) where domain is not null;

-- Free mailbox providers never become companies.
create function relay_private.personal_mail_domain(domain text) returns boolean language sql immutable set search_path='' as $$
 select domain ~ '^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|gmx|proton|protonmail|pm|mail|yandex|zoho|orange|wanadoo|free|laposte|sfr|neuf|bbox|numericable|club-internet|aliceadsl|tutanota|fastmail|hey)\.[a-z.]{2,10}$';
$$;
-- "jean-paul.dupont" -> "Jean-Paul Dupont"; "acme-conseil.fr" -> "Acme Conseil".
create function relay_private.name_from_label(label text) returns text language sql immutable set search_path='' as $$
 select left(initcap(btrim(regexp_replace(regexp_replace(label,'[0-9]+',' ','g'),'[._+]+',' ','g'))),200);
$$;

create function relay_private.capture_contacts() returns trigger language plpgsql security definer set search_path='' as $$
declare i public.integrations;own_domain text;excluded text[];people uuid;companies uuid;address text;mail_domain text;person uuid;company uuid;made integer:=0;
begin
 select * into i from public.integrations where id=new.integration_id and workspace_id=new.workspace_id;
 if i.id is null or not i.capture_contacts or i.status<>'connected' then return null;end if;
 select id into people from public.objects where workspace_id=new.workspace_id and slug='people';
 if people is null then return null;end if;
 -- Records with mandatory custom fields are created by people, never half-filled.
 if exists(select 1 from public.attributes where workspace_id=new.workspace_id and object_id=people and required and not archived and type<>'formula') then return null;end if;
 select id into companies from public.objects where workspace_id=new.workspace_id and slug='companies';
 if companies is not null and exists(select 1 from public.attributes where workspace_id=new.workspace_id and object_id=companies and required and not archived and type<>'formula') then companies:=null;end if;
 own_domain:=lower(split_part(coalesce(i.email,(select email from auth.users where id=i.user_id)),'@',2));
 select capture_excluded_domains into excluded from public.workspaces where id=new.workspace_id;
 for address in
  select distinct lower(btrim(a)) from unnest(array_cat(case when new.direction='inbound' or new.kind='calendar' then array[coalesce(new.sender_email,new.sender)] else '{}'::text[] end,
   case when new.direction='outbound' or new.kind='calendar' then new.recipients else '{}'::text[] end)) a
  where a is not null limit 25
 loop
  exit when made>=10;
  continue when address !~ '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$' or length(address)>254;
  mail_domain:=split_part(address,'@',2);
  -- Colleagues, automated senders and excluded domains are never captured.
  continue when mail_domain=own_domain or mail_domain=any(coalesce(excluded,'{}'))
   or split_part(address,'@',1) ~ '^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster|bounce[s]?|newsletter|news|info|support|contact|hello|bonjour|team|billing|factur(e|ation)|admin|root|calendar|invitations?)([+._-].*)?$';
  -- A deleted (trashed) record with this address is a decision to respect.
  continue when exists(select 1 from public.records where workspace_id=new.workspace_id and lower(email)=address);
  company:=null;
  if companies is not null and not relay_private.personal_mail_domain(mail_domain) then
   select id into company from public.records where workspace_id=new.workspace_id and object_id=companies and lower(domain)=mail_domain and merged_into is null order by archived,created_at limit 1;
   if company is null then
    insert into public.records(workspace_id,object_id,display_name,domain,owner_id)
    values(new.workspace_id,companies,coalesce(nullif(relay_private.name_from_label(replace(split_part(mail_domain,'.',1),'-',' ')),''),mail_domain),mail_domain,i.user_id) returning id into company;
   end if;
  end if;
  insert into public.records(workspace_id,object_id,display_name,email,domain,owner_id)
  values(new.workspace_id,people,coalesce(nullif(relay_private.name_from_label(split_part(address,'@',1)),''),address),address,
   case when relay_private.personal_mail_domain(mail_domain) then null else mail_domain end,i.user_id) returning id into person;
  if company is not null then
   insert into public.record_relations(workspace_id,source_id,target_id,label) values(new.workspace_id,person,company,'Travaille chez') on conflict do nothing;
  end if;
  made:=made+1;
 end loop;
 return null;
exception when unique_violation or check_violation or not_null_violation or foreign_key_violation or insufficient_privilege then
 -- Capture is best effort: a refused record never blocks the mailbox synchronization.
 return null;
end $$;
revoke all on function relay_private.capture_contacts() from public,anon,authenticated;
create trigger capture_contacts after insert on public.communications for each row execute function relay_private.capture_contacts();

-- The mailbox owner switches capture on or off for their own connection.
create function public.set_contact_capture(w uuid,p text,enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 update public.integrations set capture_contacts=enabled where workspace_id=w and user_id=auth.uid() and provider=p and provider in ('gmail','outlook','google-calendar','outlook-calendar');
 if not found then raise exception 'Relay: Connectez d’abord ce compte.' using errcode='22023';end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data)
  values(w,auth.uid(),'integrations',(select id from public.integrations where workspace_id=w and user_id=auth.uid() and provider=p),'contact_capture',jsonb_build_object('enabled',enabled));
 return enabled;
end $$;
revoke all on function public.set_contact_capture(uuid,text,boolean) from public,anon;
grant execute on function public.set_contact_capture(uuid,text,boolean) to authenticated;

-- ---------------------------------------------------------- Email tracking
alter table public.workspaces add column track_email_opens boolean not null default false,
 add column track_email_clicks boolean not null default false;
alter table public.sequence_deliveries add column open_count integer not null default 0,
 add column first_opened_at timestamptz, add column last_opened_at timestamptz,
 add column click_count integer not null default 0,
 add column first_clicked_at timestamptz, add column last_clicked_at timestamptz;

create table relay_private.email_tracking(
 token uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 delivery_id uuid not null unique references public.sequence_deliveries(id) on delete cascade,
 track_opens boolean not null, track_clicks boolean not null,
 links text[] not null default '{}' check(cardinality(links)<=20),
 created_at timestamptz not null default now()
);
alter table relay_private.email_tracking enable row level security;
revoke all on relay_private.email_tracking from public,anon,authenticated;

-- Worker: called after the delivery was prepared, before sending.
create function relay_private.email_tracking_prepare(delivery uuid,link_urls text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.sequence_deliveries;ws public.workspaces;t relay_private.email_tracking;
begin
 select * into d from public.sequence_deliveries where id=delivery;
 if d.id is null then return null;end if;
 select * into ws from public.workspaces where id=d.workspace_id;
 if not ws.track_email_opens and not ws.track_email_clicks then return null;end if;
 if coalesce(cardinality(link_urls),0)>20 or exists(select 1 from unnest(link_urls) u where u !~ '^https?://' or length(u)>2000) then raise exception 'Invalid links' using errcode='22023';end if;
 insert into relay_private.email_tracking(workspace_id,delivery_id,track_opens,track_clicks,links)
 values(d.workspace_id,d.id,ws.track_email_opens,ws.track_email_clicks,case when ws.track_email_clicks then coalesce(link_urls,'{}') else '{}' end)
 on conflict(delivery_id) do update set track_opens=excluded.track_opens,track_clicks=excluded.track_clicks,links=excluded.links
 returning * into t;
 return jsonb_build_object('token',t.token,'opens',t.track_opens,'clicks',t.track_clicks);
end $$;
-- Public endpoint: records an open or a click of a sent delivery and returns the
-- stored destination. Only URLs recorded at send time can be redirected to.
create function relay_private.email_tracking_hit(tracking uuid,kind text,link_position integer default null,count_it boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t relay_private.email_tracking;target text;sent boolean;
begin
 select * into t from relay_private.email_tracking where token=tracking;
 if t.token is null then return null;end if;
 select status='sent' into sent from public.sequence_deliveries where id=t.delivery_id;
 if kind='click' then
  if link_position is null or link_position<1 or link_position>cardinality(t.links) then return null;end if;
  target:=t.links[link_position];
  if count_it and sent and t.track_clicks then
   update public.sequence_deliveries set click_count=click_count+1,first_clicked_at=coalesce(first_clicked_at,now()),last_clicked_at=now() where id=t.delivery_id;
  end if;
  return jsonb_build_object('url',target);
 elsif kind='open' then
  if count_it and sent and t.track_opens then
   update public.sequence_deliveries set open_count=open_count+1,first_opened_at=coalesce(first_opened_at,now()),last_opened_at=now() where id=t.delivery_id;
  end if;
  return '{}'::jsonb;
 end if;
 return null;
end $$;
create function public.email_tracking_prepare(delivery uuid,link_urls text[]) returns jsonb language sql security invoker set search_path='' as $$ select relay_private.email_tracking_prepare(delivery,link_urls) $$;
create function public.email_tracking_hit(tracking uuid,kind text,link_position integer default null,count_it boolean default true) returns jsonb language sql security invoker set search_path='' as $$ select relay_private.email_tracking_hit(tracking,kind,link_position,count_it) $$;
revoke all on function relay_private.email_tracking_prepare(uuid,text[]),relay_private.email_tracking_hit(uuid,text,integer,boolean),
 public.email_tracking_prepare(uuid,text[]),public.email_tracking_hit(uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function relay_private.email_tracking_prepare(uuid,text[]),relay_private.email_tracking_hit(uuid,text,integer,boolean),
 public.email_tracking_prepare(uuid,text[]),public.email_tracking_hit(uuid,text,integer,boolean) to service_role;

-- Enabling open tracking is an administrator decision (consent obligations apply).
create function relay_private.guard_workspace_tracking() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.track_email_opens is distinct from old.track_email_opens or new.track_email_clicks is distinct from old.track_email_clicks
  or new.capture_excluded_domains is distinct from old.capture_excluded_domains)
  and (select auth.uid()) is not null and not relay_private.has_role(new.id,array['owner','admin']) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if exists(select 1 from unnest(new.capture_excluded_domains) d where d !~ '^[a-z0-9.-]+\.[a-z]{2,}$') then
  raise exception 'Relay: Domaine exclu invalide.' using errcode='22023';
 end if;
 return new;
end $$;
revoke all on function relay_private.guard_workspace_tracking() from public,anon,authenticated;
create trigger guard_workspace_tracking before update of track_email_opens,track_email_clicks,capture_excluded_domains on public.workspaces
 for each row execute function relay_private.guard_workspace_tracking();

commit;
