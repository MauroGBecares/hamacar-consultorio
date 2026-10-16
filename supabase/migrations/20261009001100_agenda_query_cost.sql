-- Validate the actor once; assignment checks are per patient, not per calendar cell.
create or replace function public.agenda_read(p_from date,p_to date,p_room integer default null,p_professional uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; u uuid:=hamacar.actor(); is_partner boolean:=hamacar.partner();
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'Consultá hasta 63 días por vez.'; end if;
 with candidates as materialized (
  select s.* from public.booking_series s where (p_professional is null or s.professional_id=p_professional)
  and ((s.start_date<=p_to and coalesce(s.until_date,case when s.every=0 then s.start_date else '9999-12-31'::date end)>=p_from)
  or exists(select 1 from public.booking_exceptions e where e.series_id=s.id and not e.cancelled and e.date between p_from and p_to))
 ), access as materialized (
  select pt.id,pt.name,is_partner or exists(select 1 from public.patient_team where patient_id=pt.id and professional_id=u) as allowed
  from public.patients pt where pt.id in(select patient_id from candidates)
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'original',e.original,'date',e.date,
 'from',to_char(e.from_time,'HH24:MI'),'to',to_char(e.to_time,'HH24:MI'),'room',e.room,'every',s.every,
 'professionalId',s.professional_id,'professional',pr.full_name,'patientName',case when a.allowed then a.name else null end,
 'patientId',case when a.allowed then a.id else null end,'until',coalesce(s.until_date::text,''),'changed',e.changed,
 'editable',(e.date+e.from_time) at time zone 'America/Argentina/Cordoba'>now() and (is_partner or (s.professional_id=u and a.allowed)))
 order by e.date,e.from_time,s.id,e.original),'[]') into result
 from candidates s join access a on a.id=s.patient_id join public.profiles pr on pr.id=s.professional_id
 cross join lateral generate_series(0,p_to-p_from) delta
 cross join lateral hamacar.occurrences(s::public.booking_series,p_from+delta) e
 where p_room is null or e.room=p_room;
 return result;
end $$;
do $$
begin
 execute replace(pg_get_functiondef('hamacar.agenda_conflicts(uuid)'::regprocedure),
 'for d in select low+i from generate_series(0,least(n,high-low)) i',
 'for d in select low+i from generate_series(0,least(n,high-low)) i where hamacar.base_on(a,low+i) and hamacar.base_on(b,low+i)');
end $$;
