create or replace function public.agenda_read(p_from date,p_to date,p_room integer default null,p_professional uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform hamacar.actor();
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'Consultá hasta 63 días por vez.'; end if;
 with candidates as materialized (
  select s.* from public.booking_series s where (p_professional is null or s.professional_id=p_professional)
  and ((s.start_date<=p_to and coalesce(s.until_date,case when s.every=0 then s.start_date else '9999-12-31'::date end)>=p_from)
  or exists(select 1 from public.booking_exceptions e where e.series_id=s.id and not e.cancelled and e.date between p_from and p_to))
 )
 select coalesce(jsonb_agg(hamacar.event(s,e.original,e.date,e.from_time,e.to_time,e.room,e.changed) order by e.date,e.from_time,s.id,e.original),'[]') into result
 from candidates s cross join lateral generate_series(0,p_to-p_from) delta
 cross join lateral hamacar.occurrences(s::public.booking_series,p_from+delta) e
 where p_room is null or e.room=p_room;
 return result;
end $$;

create or replace function hamacar.audit(area text,entity uuid,action text,before_data jsonb,after_data jsonb,
 patient uuid default null,owner uuid default null,visibility text default 'shared',reason text default '')
 returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); actor_name text; changes jsonb;
begin
 select full_name into actor_name from public.profiles where id=u;
 select coalesce(jsonb_agg(jsonb_build_object('field',key,'before',coalesce(before_data->>key,''),'after',coalesce(after_data->>key,'')) order by key),'[]')
 into changes from (select jsonb_object_keys(coalesce(before_data,'{}')||coalesce(after_data,'{}')) as key) fields
 where before_data->key is distinct from after_data->key and key not in ('version','updated_at');
 if reason<>'' then changes:=changes||jsonb_build_array(jsonb_build_object('field','Motivo','before','','after',reason)); end if;
 insert into public.audit_entries(area,entity_id,action,actor_id,actor,origin,before_data,after_data,patient_id,owner_id,visibility,changes)
 values(area,entity,action,u,coalesce(actor_name,session_user),case when u is null then 'database:'||session_user else 'application' end,
 before_data,after_data,patient,owner,visibility,changes);
end $$;

create function public.audit_page(p_area text,p_id uuid,p_cursor uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.session_status();
 select coalesce(jsonb_agg(to_jsonb(x) order by x.at desc,x.id desc),'[]') into result from (
 select a.id,a.entity_id,a.action,a.actor,a.at,a.changes from public.audit_entries a
 where a.area=p_area and (a.entity_id=p_id or (p_area='finance' and (
 a.entity_id in(select id from public.transfers where settlement_id=p_id) or
 a.entity_id in(select id from public.collections where settlement_id=p_id or period_id=p_id))))
 and (p_cursor is null or (a.at,a.id)<(select at,id from public.audit_entries where id=p_cursor))
 order by a.at desc,a.id desc limit 50)x;
 return result;
end $$;
revoke all on function public.audit_page(text,uuid,uuid) from public,anon;
grant execute on function public.audit_page(text,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
