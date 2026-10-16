-- Synthetic fixture is rolled back inside the exception block. No HTTP objects.
create or replace function pg_temp.hamacar_benchmark() returns jsonb language plpgsql as $$
declare result jsonb; started timestamptz; read_ms numeric; conflict_ms numeric; events jsonb;
 owner uuid:='30000000-0000-4000-8000-000000000001'; patient uuid:='30000000-0000-4000-8000-000000000002';
 target uuid; before_start time; exact_start time; body jsonb;
begin
 begin
  insert into auth.users(id,email,created_at) values(owner,'hamacar-rollback-benchmark@example.invalid',now());
  update public.profiles set full_name='Prueba de volumen',discipline='Prueba',active=true where id=owner;
  insert into auth.sessions(id,user_id,created_at) values('30000000-0000-4000-8000-000000000003',owner,now());
  insert into public.patients(id,name,admission,created_by) values(patient,'Paciente ficticio de volumen','2000-01-01',owner);
  insert into public.patient_team values(patient,owner);
  insert into public.booking_series(id,professional_id,patient_id,room,start_date,until_date,from_time,to_time,every)
  select md5('benchmark-hamacar:'||i)::uuid,owner,patient,1,
   case when i<=500 then '2010-01-04'::date else '2100-01-04'::date end,
   case when i<=500 then '2020-01-04'::date when i<=750 then '2100-01-04'::date else null end,
   '00:00'::time+make_interval(mins=>i),'00:00'::time+make_interval(mins=>i+1),case when i<=750 and i>500 then 0 else 7 end
  from generate_series(1,1000)i;
  insert into public.booking_exceptions(series_id,original_date,cancelled)
  select md5('benchmark-hamacar:'||i)::uuid,'2100-01-04',true from generate_series(501,750)i;
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
  perform public.session_open();
  started:=clock_timestamp();events:=public.agenda_read('2100-01-04','2100-01-10',null,owner);read_ms:=1000*extract(epoch from clock_timestamp()-started);
  if jsonb_array_length(events)<>250 then raise exception 'FAIL: rango con terminadas y canceladas';end if;
  started:=clock_timestamp();
  perform public.agenda_command('new',jsonb_build_object('data',jsonb_build_object('professionalId',owner,'patientId',patient,'room',1,'start','2100-01-04','from','23:00','to','23:30','every',7,'until','')),gen_random_uuid());
  conflict_ms:=1000*extract(epoch from clock_timestamp()-started);
  -- Test exact server instant, avoiding browser timezone/clock assumptions.
  reset role;
  exact_start:=(now() at time zone 'America/Argentina/Cordoba')::time;
  if exact_start<'23:59'::time then
   insert into public.booking_series(professional_id,patient_id,room,start_date,from_time,to_time,every)
   values(owner,patient,3,(now() at time zone 'America/Argentina/Cordoba')::date,exact_start,exact_start+interval '1 minute',0) returning id into target;
   set local role authenticated;
   begin
    perform public.agenda_command('cancel-one',jsonb_build_object('id',target,'version',1,'original',(now() at time zone 'America/Argentina/Cordoba')::date),gen_random_uuid());
    raise exception 'FAIL: permite cancelar en el instante inicial';
   exception when raise_exception then if SQLERRM not like 'El encuentro ya comenzó%' then raise;end if;end;
  end if;
  result:=jsonb_build_object('series',1000,'ended',500,'cancelledExceptions',250,'indefinite',250,'visibleEvents',jsonb_array_length(events),'readWeekMs',read_ms,'validateNewSeriesMs',conflict_ms,'exactStartBlocked',true);
  raise exception using errcode='H0001',message='Rollback fixture';
 exception when sqlstate 'H0001' then null;
 end;
 return result;
end $$;
select pg_temp.hamacar_benchmark() as evidence;
