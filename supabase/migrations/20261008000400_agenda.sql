create table public.booking_series (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.profiles(id),
 patient_id uuid not null references public.patients(id),room smallint not null check(room between 1 and 3),
 start_date date not null, until_date date, from_time time not null,to_time time not null,
 every smallint not null check(every in (0,7,14)),version integer not null default 1,
 created_at timestamptz not null default now(), check(from_time<to_time)
);
create table public.booking_exceptions (
 series_id uuid not null references public.booking_series(id),original_date date not null,
 cancelled boolean not null default false,date date,from_time time,to_time time,room smallint,
 primary key(series_id,original_date),check(cancelled or (date is not null and from_time<to_time and room between 1 and 3))
);
create index on public.booking_series(room,start_date,until_date);
create index on public.booking_series(professional_id,start_date,until_date);
create index on public.booking_series(patient_id,start_date,until_date);
create index on public.booking_exceptions(date,room) where not cancelled;
create function hamacar.base_on(s public.booking_series,d date) returns boolean language sql immutable set search_path='' as $$
 select d>=s.start_date and (s.until_date is null or d<=s.until_date) and
 case when s.every=0 then d=s.start_date else (d-s.start_date)%s.every=0 end
$$;
create function hamacar.occurrences(s public.booking_series,d date)
returns table(original date,date date,from_time time,to_time time,room smallint,changed boolean)
language sql stable security definer set search_path='' as $$
 select d,d,s.from_time,s.to_time,s.room,false where hamacar.base_on(s,d)
 and not exists(select 1 from public.booking_exceptions where series_id=s.id and original_date=d)
 union all
 select e.original_date,e.date,e.from_time,e.to_time,e.room,true from public.booking_exceptions e
 where e.series_id=s.id and not e.cancelled and e.date=d
 -- Retained exceptions stand independently from the now shortened base series.
$$;
create function hamacar.event(s public.booking_series,original date,d date,f time,t time,r smallint,changed boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'version',s.version,'original',original,'date',d,'from',to_char(f,'HH24:MI'),
 'to',to_char(t,'HH24:MI'),'room',r,'every',s.every,'professionalId',s.professional_id,'professional',p.full_name,
 'patientName',case when hamacar.patient_access(s.patient_id) then pt.name else null end,
 'patientId',case when hamacar.patient_access(s.patient_id) then s.patient_id else null end,
 'until',coalesce(s.until_date::text,''),'changed',changed,'editable',
 (d+f) at time zone 'America/Argentina/Cordoba'>now() and
 (hamacar.partner() or (s.professional_id=auth.uid() and hamacar.patient_access(s.patient_id))))
 from public.profiles p,public.patients pt where p.id=s.professional_id and pt.id=s.patient_id
$$;
create function public.agenda_read(p_from date,p_to date,p_room integer default null,p_professional uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform hamacar.actor();
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'Consultá hasta 63 días por vez.'; end if;
 select coalesce(jsonb_agg(hamacar.event(s,e.original,e.date,e.from_time,e.to_time,e.room,e.changed) order by e.date,e.from_time,s.id,e.original),'[]') into result
 from public.booking_series s cross join lateral generate_series(0,p_to-p_from) delta
 cross join lateral hamacar.occurrences(s,p_from+delta) e
 where (p_professional is null or s.professional_id=p_professional) and (p_room is null or e.room=p_room);
 return result;
end $$;
create function public.agenda_next(p_patient uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.booking_series; d date; i integer; n integer; e record; result jsonb; best timestamptz:='infinity'; candidate timestamptz;
begin
 perform hamacar.actor();
 if not hamacar.patient_access(p_patient) then raise exception using errcode='42501',message='Paciente no disponible.'; end if;
 for s in select * from public.booking_series where patient_id=p_patient loop
   d:=case when s.every=0 then s.start_date else s.start_date+greatest(0,ceil((hamacar.today()-s.start_date)::numeric/s.every)::integer)*s.every end;
   select count(*)+2 into n from public.booking_exceptions where series_id=s.id;
   for i in 0..n loop
     exit when s.until_date is not null and d>s.until_date;
     for e in select * from hamacar.occurrences(s,d) loop
       candidate:=(e.date+e.from_time) at time zone 'America/Argentina/Cordoba';
       if candidate>now() and candidate<best then best:=candidate; result:=hamacar.event(s,e.original,e.date,e.from_time,e.to_time,e.room,e.changed); end if;
     end loop;
     exit when s.every=0 or (d+s.from_time) at time zone 'America/Argentina/Cordoba'>best;
     d:=d+s.every;
   end loop;
   for e in select * from public.booking_exceptions where series_id=s.id and not cancelled and date>=hamacar.today() loop
     candidate:=(e.date+e.from_time) at time zone 'America/Argentina/Cordoba';
     if candidate>now() and candidate<best then best:=candidate; result:=hamacar.event(s,e.original_date,e.date,e.from_time,e.to_time,e.room,true); end if;
   end loop;
 end loop;
 return result;
end $$;
create function hamacar.agenda_conflicts(target uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.booking_series; b public.booking_series; low date; high date; n integer; d date;
begin
 select * into a from public.booking_series where id=target;
 -- Only pairs involving the changed series; exceptions can change the room and date.
 for b in select * from public.booking_series s where s.professional_id=a.professional_id or s.patient_id=a.patient_id
 or s.room in (select a.room union select room from public.booking_exceptions where series_id=a.id and not cancelled)
 or exists(select 1 from public.booking_exceptions e where e.series_id=s.id and not e.cancelled and
 e.room in (select a.room union select room from public.booking_exceptions where series_id=a.id and not cancelled)) loop
   low:=greatest(a.start_date,b.start_date);
   high:=least(case when a.every=0 then a.start_date else coalesce(a.until_date,'9999-12-31') end,
               case when b.every=0 then b.start_date else coalesce(b.until_date,'9999-12-31') end);
   select 14*(count(*)+2) into n from public.booking_exceptions where series_id in (a.id,b.id);
   for d in select low+i from generate_series(0,least(n,high-low)) i
            union select date from public.booking_exceptions where series_id in (a.id,b.id) and not cancelled loop
     if exists(select 1 from hamacar.occurrences(a,d) x cross join hamacar.occurrences(b,d) y
     where (a.id<>b.id or x.original<>y.original) and x.from_time<y.to_time and y.from_time<x.to_time
     and (x.room=y.room or a.professional_id=b.professional_id or a.patient_id=b.patient_id)) then return true; end if;
   end loop;
 end loop;
 return false;
end $$;
create function public.agenda_command(p_action text,p_input jsonb,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hamacar.actor(); target uuid:=nullif(p_input->>'id','')::uuid; old public.booking_series; next public.booking_series;
 orig date:=nullif(p_input->>'original','')::date; ex public.booking_exceptions; effective date; effective_time time;
 d jsonb:=p_input->'data'; cut date; result jsonb; before_data jsonb;
begin
 perform pg_advisory_xact_lock(78341001);
 if target is not null then
   select * into old from public.booking_series where id=target for update;
   if old.id is null or not(hamacar.partner() or (old.professional_id=u and hamacar.patient_access(old.patient_id)))
   then raise exception using errcode='42501',message='Reserva no disponible.'; end if;
 end if;
 result:=hamacar.operation_begin('agenda:'||p_action,p_input,p_operation); if result is not null then return result; end if;
 if target is not null then
   if old.version is distinct from (p_input->>'version')::integer then raise exception using errcode='40001',message='La reserva cambió. Recargá la agenda.'; end if;
   select * into ex from public.booking_exceptions where series_id=target and original_date=orig;
   if orig is null or coalesce(ex.cancelled,false) or (ex.series_id is null and not hamacar.base_on(old,orig)) then raise exception 'Encuentro no disponible.'; end if;
   effective:=coalesce(ex.date,orig); effective_time:=coalesce(ex.from_time,old.from_time);
   if (effective+effective_time) at time zone 'America/Argentina/Cordoba'<=now() then raise exception 'El encuentro ya comenzó y no se puede modificar.'; end if;
   before_data:=to_jsonb(old)||jsonb_build_object('exceptions',(select jsonb_agg(to_jsonb(e)) from public.booking_exceptions e where series_id=target));
 end if;
 if p_action in ('new','one','future') then
   next.professional_id:=(d->>'professionalId')::uuid; next.patient_id:=(d->>'patientId')::uuid;
   if not hamacar.partner() and next.professional_id<>u then raise exception using errcode='42501',message='Reservá para tu propia agenda.'; end if;
   perform hamacar.patient_require(next.patient_id,true);
   if not exists(select 1 from public.patient_team t join public.profiles p on p.id=t.professional_id where t.patient_id=next.patient_id and p.id=next.professional_id and p.active)
   then raise exception 'Elegí un paciente asignado a una profesional activa.'; end if;
   if old.id is not null and (old.patient_id<>next.patient_id or old.professional_id<>next.professional_id) then raise exception 'No se puede cambiar paciente o profesional de una reserva.'; end if;
   next.start_date:=(d->>'start')::date; next.until_date:=nullif(d->>'until','')::date; next.from_time:=(d->>'from')::time; next.to_time:=(d->>'to')::time;
   next.room:=(d->>'room')::smallint; next.every:=case when p_action='one' then 0 else (d->>'every')::smallint end;
   if (next.start_date+next.from_time) at time zone 'America/Argentina/Cordoba'<=now() or next.until_date<next.start_date or next.from_time>=next.to_time
   or next.room not between 1 and 3 or next.every not in (0,7,14) then raise exception 'Revisá fecha, horario, consultorio y frecuencia.'; end if;
   if next.every=0 then next.until_date:=next.start_date; end if;
 end if;
 if p_action='new' and target is null then
   insert into public.booking_series(professional_id,patient_id,room,start_date,until_date,from_time,to_time,every)
   values(next.professional_id,next.patient_id,next.room,next.start_date,next.until_date,next.from_time,next.to_time,next.every) returning * into next;
 elsif p_action in ('one','cancel-one') and target is not null then
   insert into public.booking_exceptions(series_id,original_date,cancelled,date,from_time,to_time,room)
   values(target,orig,p_action='cancel-one',next.start_date,next.from_time,next.to_time,next.room)
   on conflict(series_id,original_date) do update set cancelled=excluded.cancelled,date=excluded.date,from_time=excluded.from_time,to_time=excluded.to_time,room=excluded.room;
   update public.booking_series set version=version+1 where id=target returning * into next;
 elsif p_action in ('future','cancel-future') and target is not null and old.every<>0 then
   cut:=case when p_action='future' then next.start_date else effective end;
   if cut<orig or (cut+old.from_time) at time zone 'America/Argentina/Cordoba'<=now() then raise exception 'El corte no puede modificar encuentros ya iniciados.'; end if;
   -- Preserve an original future occurrence already moved before the cut, including past encounters.
   update public.booking_exceptions set cancelled=true where series_id=target and not cancelled and date>=cut;
   update public.booking_series set until_date=least(coalesce(until_date,cut-1),cut-1),version=version+1 where id=target;
   if p_action='future' then
     insert into public.booking_series(professional_id,patient_id,room,start_date,until_date,from_time,to_time,every)
     values(next.professional_id,next.patient_id,next.room,next.start_date,next.until_date,next.from_time,next.to_time,next.every) returning * into next;
   else select * into next from public.booking_series where id=target; end if;
 else raise exception 'Alcance de operación inválido.'; end if;
 if p_action in ('new','one','future') and hamacar.agenda_conflicts(next.id) then raise exception using errcode='23P01',message='Hay una superposición de consultorio, profesional o paciente. Elegí otro horario.'; end if;
 perform hamacar.audit('agenda',coalesce(target,next.id),'Reserva: '||p_action,before_data,to_jsonb(next),next.patient_id,next.professional_id);
 return hamacar.operation_end(p_operation,jsonb_build_object('id',next.id,'version',next.version));
end $$;
alter table public.booking_series enable row level security;
alter table public.booking_exceptions enable row level security;
-- Raw series would leak patient IDs. Occupancy is available exclusively through redacting RPCs.
revoke all on public.booking_series,public.booking_exceptions from anon,authenticated;
revoke execute on all functions in schema hamacar from public,anon,authenticated;
grant execute on function hamacar.active(),hamacar.partner(),hamacar.patient_access(uuid),hamacar.attachment_access(uuid) to authenticated;
revoke execute on function public.agenda_read(date,date,integer,uuid),public.agenda_next(uuid),public.agenda_command(text,jsonb,uuid) from public,anon;
grant execute on function public.agenda_read(date,date,integer,uuid),public.agenda_next(uuid),public.agenda_command(text,jsonb,uuid) to authenticated;
