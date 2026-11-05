set local lock_timeout='5s';
-- Public form limits sized for commercial use: per form 120/min, 5000/day; per source 10/min, 300/day.
do $$declare definition text;old_guard text;new_guard text;begin
 definition:=pg_get_functiondef('public.record_form_submit(uuid,jsonb,uuid)'::regprocedure);
 old_guard:=$old$created_at>now()-interval '1 minute')>=10 or (select count(*) from public.record_form_receipts where config_id=c.id and created_at>now()-interval '1 day')>=500 then$old$;
 new_guard:=$new$created_at>now()-interval '1 minute')>=120 or (select count(*) from public.record_form_receipts where config_id=c.id and created_at>now()-interval '1 day')>=5000 then$new$;
 if position(old_guard in definition)=0 then raise exception 'Form quota guard changed; review migration';end if;
 execute replace(definition,old_guard,new_guard);
 definition:=pg_get_functiondef('relay_private.record_form_admit(text)'::regprocedure);
 old_guard:=$old$return minute_count<=5 and day_count<=50;$old$;
 new_guard:=$new$return minute_count<=10 and day_count<=300;$new$;
 if position(old_guard in definition)=0 then raise exception 'Form source guard changed; review migration';end if;
 execute replace(definition,old_guard,new_guard);
end $$;
