create table public.service_periods (
 id uuid primary key default gen_random_uuid(),professional_id uuid not null references public.profiles(id),
 patient_id uuid not null references public.patients(id),patient_name text not null,month date not null check(extract(day from month)=1),
 mode text check(mode in ('Particular','Cobertura')),coverage text not null,cud text not null,
 declared boolean not null default false,complete boolean not null default false,no_service boolean not null default false,
 performed integer not null default 0 check(performed between 0 and 100000),sessions_paid integer not null default 0 check(sessions_paid>=0 and sessions_paid<=performed),
 notes jsonb not null default '[]',version integer not null default 1,unique(professional_id,patient_id,month)
);
create table public.settlements (
 id uuid primary key default gen_random_uuid(),professional_id uuid not null references public.profiles(id),month date not null check(extract(day from month)=1),
 notes jsonb not null default '[]',version integer not null default 1,unique(professional_id,month)
);
create table public.collections (
 id uuid primary key default gen_random_uuid(),professional_id uuid not null references public.profiles(id),period_id uuid not null references public.service_periods(id),
 date date not null,received_cents bigint check(received_cents between 0 and 9000000000000),contribution_cents bigint not null check(contribution_cents between 1 and 9000000000000),
 settlement_id uuid references public.settlements(id),patient_name text not null,mode text not null check(mode in ('Particular','Cobertura')),
 coverage text not null,discipline text not null,sessions_paid integer not null check(sessions_paid between 0 and 100000),
 cancelled boolean not null default false,version integer not null default 1,created_at timestamptz not null default now()
);
create index on public.collections(professional_id,date,id);
create index on public.collections(period_id,id);
create index on public.collections(settlement_id,id);
create table public.transfers (
 id uuid primary key default gen_random_uuid(),settlement_id uuid not null references public.settlements(id),
 date date not null,amount_cents bigint not null check(amount_cents between 1 and 9000000000000),
 state text not null default 'informed' check(state in ('informed','observed','verified','replaced')),
 receipt_id uuid not null unique references public.attachments(id),notes jsonb not null default '[]',
 verified_by uuid references public.profiles(id),verified_at timestamptz,replaces_id uuid unique references public.transfers(id),
 version integer not null default 1,created_at timestamptz not null default now()
);
create index on public.transfers(settlement_id,id);
create index on public.transfers(date,state,id);
alter table public.attachments add foreign key(settlement_id) references public.settlements(id);
alter table public.attachments add foreign key(transfer_id) references public.transfers(id);
create table hamacar.finance_revision(id boolean primary key default true check(id),revision bigint not null default 0);
insert into hamacar.finance_revision values(true,0);
create function hamacar.finance_access(owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select hamacar.active() and (owner=auth.uid() or hamacar.partner())
$$;
create function hamacar.note(body text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when length(trim(coalesce(body,'')))=0 then '[]'::jsonb else
 jsonb_build_array(jsonb_build_object('text',trim(body),'author',p.full_name,'at',now())) end from public.profiles p where id=auth.uid()
$$;
create function public.finance_command(p_action text,p_input jsonb,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hamacar.actor(); owner uuid; actor_profile public.profiles; p public.service_periods; s public.settlements;
 c public.collections; t public.transfers; a public.attachments; patient public.patients;
 target uuid:=nullif(p_input->>'id','')::uuid; result jsonb; old_data jsonb; new_id uuid; new_version integer;
 note text:=trim(coalesce(p_input->>'observation','')); reason text:=trim(coalesce(p_input->>'reason',''));
 mode text:=p_input->>'mode'; ids uuid[]; amount bigint; dt date; paid integer; performed integer; total_paid integer; month date;
begin
 -- Serializes finance mutations and revision increments; row locks follow period -> settlement -> collection -> transfer -> attachment.
 perform pg_advisory_xact_lock(78341002);
 select * into actor_profile from public.profiles where id=u;
 if p_action not in ('verify','observe') and actor_profile.role<>'professional' then raise exception using errcode='42501',message='Solo la autora profesional puede cargar o corregir operaciones.'; end if;
 if p_action in ('verify','observe') and not hamacar.partner() then raise exception using errcode='42501',message='Revisión reservada a socias.'; end if;
 result:=hamacar.operation_begin('finance:'||p_action,p_input,p_operation); if result is not null then return result; end if;
 if length(note)>4000 or length(reason)>4000 then raise exception 'La observación es demasiado larga.'; end if;
 if p_action in ('collection','no-service','reopen','period-note') then
   if target is not null then select * into p from public.service_periods where id=target for update;
   else
     month:=(p_input->>'month')::date;
     if month is null or month>hamacar.today() or extract(day from month)<>1 then raise exception 'Período inválido.'; end if;
     patient:=hamacar.patient_require((p_input->>'patientId')::uuid,true);
     insert into public.service_periods(professional_id,patient_id,patient_name,month,coverage,cud)
     values(u,patient.id,patient.name,month,coalesce(patient.data->>'insurance',''),coalesce(patient.data->>'cud','')) on conflict do nothing;
     select * into p from public.service_periods where professional_id=u and patient_id=patient.id and service_periods.month=finance_command.month for update;
   end if;
   if p.id is null or p.professional_id<>u then raise exception using errcode='42501',message='Período no disponible.'; end if;
   if p.version<>coalesce((p_input->>'version')::integer,1) then raise exception using errcode='40001',message='El período cambió. Recargá los datos.'; end if;
   old_data:=to_jsonb(p); owner:=u;
   if p_action='collection' then
     if p.complete or p.no_service then raise exception 'El período está completo o sin prestación.'; end if;
     if mode is null or mode not in ('Particular','Cobertura') or (p.mode is not null and mode<>p.mode) then raise exception 'La modalidad queda fijada con el primer cobro.'; end if;
     dt:=(p_input->>'date')::date; amount:=(p_input->>'contributionCents')::bigint;
     if dt is null or dt>hamacar.today() or dt<p.month or amount is null then raise exception 'Fecha o importe inválido.'; end if;
     paid:=case when mode='Particular' then (p_input->>'sessionsPaid')::integer else 0 end;
     performed:=case when mode='Particular' then (p_input->>'performed')::integer else 0 end;
     if paid is null or performed is null or (mode='Particular' and (paid<1 or p.sessions_paid+paid>performed)) or (mode='Cobertura' and nullif(p_input->>'receivedCents','') is null) then raise exception 'Revisá sesiones e importe recibido.'; end if;
     insert into public.collections(professional_id,period_id,date,received_cents,contribution_cents,patient_name,mode,coverage,discipline,sessions_paid)
     values(u,p.id,dt,case when mode='Cobertura' then (p_input->>'receivedCents')::bigint else null end,amount,p.patient_name,mode,p.coverage,actor_profile.discipline,paid) returning * into c;
     update public.service_periods set mode=finance_command.mode,declared=true,complete=coalesce((p_input->>'complete')::boolean,false),performed=finance_command.performed,
     sessions_paid=sessions_paid+paid,notes=notes||hamacar.note(note),version=version+1 where id=p.id returning * into p;
   elsif p_action='no-service' then
     if p.no_service or exists(select 1 from public.collections where period_id=p.id) then raise exception 'El período ya fue declarado o tiene antecedentes de cobros.'; end if;
     update public.service_periods set declared=true,complete=true,no_service=true,notes=notes||hamacar.note('Sin prestación, confirmado por la profesional.'),version=version+1 where id=p.id returning * into p;
   elsif p_action='reopen' then
     if not p.no_service or reason='' or exists(select 1 from public.collections where period_id=p.id) then raise exception 'Solo se puede reabrir Sin prestación sin cobros y con motivo.'; end if;
     update public.service_periods set no_service=false,complete=false,declared=false,notes=notes||hamacar.note(reason),version=version+1 where id=p.id returning * into p;
   else
     if note='' then raise exception 'Escribí una observación.'; end if;
     update public.service_periods set declared=true,notes=notes||hamacar.note(note),version=version+1 where id=p.id returning * into p;
   end if;
   new_id:=p.id; new_version:=p.version; result:=to_jsonb(p)||jsonb_build_object('collection',to_jsonb(c));
 elsif p_action in ('correct','annul','detach') then
   select * into c from public.collections where id=target;
   if c.id is null or c.professional_id<>u or c.cancelled then raise exception using errcode='42501',message='Cobro no disponible.'; end if;
   select * into p from public.service_periods where id=c.period_id for update;
   if c.settlement_id is not null then select * into s from public.settlements where id=c.settlement_id for update; end if;
   select * into c from public.collections where id=target for update;
   if c.version is distinct from (p_input->>'version')::integer then raise exception using errcode='40001',message='El cobro cambió. Recargá los datos.'; end if;
   if reason='' then raise exception 'Indicá el motivo de la corrección.'; end if;
   if exists(select 1 from public.transfers where settlement_id=c.settlement_id) then raise exception 'El concepto está congelado porque existe una transferencia.'; end if;
   old_data:=to_jsonb(c); owner:=u;
   if p_action='correct' then
     dt:=(p_input->>'date')::date; amount:=(p_input->>'contributionCents')::bigint;
     paid:=case when c.mode='Particular' then (p_input->>'sessionsPaid')::integer else 0 end;
     performed:=case when c.mode='Particular' then (p_input->>'performed')::integer else 0 end;
     if dt is null or dt>hamacar.today() or dt<p.month or amount is null or paid is null or performed is null or
     (s.id is not null and date_trunc('month',dt)::date>s.month) or (c.mode='Particular' and paid<1) then raise exception 'Revisá fecha, importe y sesiones.'; end if;
     update public.collections set date=dt,contribution_cents=amount,received_cents=case when c.mode='Cobertura' then (p_input->>'receivedCents')::bigint else null end,
     sessions_paid=paid,version=version+1 where id=c.id returning * into c;
   elsif p_action='annul' then
     update public.collections set cancelled=true,settlement_id=null,version=version+1 where id=c.id returning * into c;
     performed:=p.performed;
   else
     if c.settlement_id is null then raise exception 'El concepto no está incluido.'; end if;
     update public.collections set settlement_id=null,version=version+1 where id=c.id returning * into c;
     performed:=p.performed;
   end if;
   select coalesce(sum(sessions_paid),0) into total_paid from public.collections where period_id=p.id and not cancelled;
   if total_paid>performed then raise exception 'Las sesiones cobradas no pueden superar las realizadas.'; end if;
   update public.service_periods set sessions_paid=total_paid,performed=finance_command.performed,
   complete=case when p_action='annul' then false when p_action='correct' then coalesce((p_input->>'complete')::boolean,false) else complete end,
   version=version+1 where id=p.id;
   if s.id is not null then update public.settlements set version=version+1 where id=s.id; end if;
   new_id:=c.id;new_version:=c.version;result:=to_jsonb(c);
 elsif p_action in ('prepare','settlement-create','transfer') then
   if target is not null then select * into s from public.settlements where id=target for update;
   else
     month:=(p_input->>'month')::date;
     if month is null or month>hamacar.today() or extract(day from month)<>1 then raise exception 'Ciclo inválido.'; end if;
     insert into public.settlements(professional_id,month) values(u,month) on conflict do nothing;
     select * into s from public.settlements where professional_id=u and settlements.month=finance_command.month for update;
   end if;
   if s.id is null or s.professional_id<>u then raise exception using errcode='42501',message='Liquidación no disponible.'; end if;
   if s.version<>coalesce((p_input->>'version')::integer,1) then raise exception using errcode='40001',message='La liquidación cambió. Recargá los datos.'; end if;
   owner:=u;old_data:=to_jsonb(s);
   if p_action='prepare' then
     if exists(select 1 from public.transfers where settlement_id=s.id) then raise exception 'Los conceptos están congelados.'; end if;
     select coalesce(array_agg(value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(p_input->'collectionIds');
     if cardinality(ids)=0 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) or exists(select 1 from unnest(ids)x where not exists(
       select 1 from public.collections where id=x and professional_id=u and not cancelled and settlement_id is null and date_trunc('month',date)::date<=s.month)) then raise exception 'Seleccioná cobros propios, vigentes y aún no incluidos, hasta este ciclo.'; end if;
     update public.collections set settlement_id=s.id,version=version+1 where id=any(ids);
     update public.settlements set notes=notes||hamacar.note(note),version=version+1 where id=s.id returning * into s;
   elsif p_action='transfer' then
     if not exists(select 1 from public.collections where settlement_id=s.id and not cancelled) then raise exception 'Incluí al menos un concepto antes de transferir.'; end if;
     if nullif(p_input->>'replacesId','') is not null then
       select * into t from public.transfers where id=(p_input->>'replacesId')::uuid for update;
       if t.id is null or t.settlement_id<>s.id or t.state<>'observed' or t.version is distinct from (p_input->>'replacesVersion')::integer then raise exception using errcode='40001',message='La transferencia a reemplazar cambió.'; end if;
     end if;
     select * into a from public.attachments where id=(p_input->>'receiptId')::uuid for update;
     if a.id is null or a.owner_id<>u or a.purpose<>'receipt' or a.settlement_id<>s.id or a.state<>'validated' or a.transfer_id is not null then raise exception 'Adjuntá un comprobante validado para esta liquidación.'; end if;
     dt:=(p_input->>'date')::date;amount:=(p_input->>'amountCents')::bigint;
     if dt is null or dt>hamacar.today() or amount is null then raise exception 'Revisá fecha e importe.'; end if;
     if t.id is not null then update public.transfers set state='replaced',version=version+1 where id=t.id; end if;
     insert into public.transfers(settlement_id,date,amount_cents,receipt_id,notes,replaces_id) values(s.id,dt,amount,a.id,hamacar.note(note),t.id) returning * into t;
     update public.attachments set transfer_id=t.id where id=a.id;
     update public.settlements set version=version+1 where id=s.id returning * into s;
   end if;
   new_id:=s.id;new_version:=s.version;result:=to_jsonb(s)||jsonb_build_object('transfer',to_jsonb(t),'concepts',ids);
 elsif p_action in ('verify','observe') then
   select * into t from public.transfers where id=target;
   select * into s from public.settlements where id=t.settlement_id for update;
   select * into t from public.transfers where id=target for update;
   if t.id is null or t.state<>'informed' or t.version is distinct from (p_input->>'version')::integer then raise exception using errcode='40001',message='La transferencia ya fue revisada o cambió de versión.'; end if;
   if p_action='observe' and reason='' then raise exception 'Explicá el motivo de la observación.'; end if;
   owner:=s.professional_id;old_data:=to_jsonb(t);
   update public.transfers set state=case when p_action='verify' then 'verified' else 'observed' end,version=version+1,
    verified_by=case when p_action='verify' then u else null end,verified_at=case when p_action='verify' then now() else null end,
    notes=notes||hamacar.note(reason) where id=t.id returning * into t;
   update public.settlements set version=version+1 where id=s.id;
   new_id:=t.id;new_version:=t.version;result:=to_jsonb(t);
 else raise exception 'Operación económica inválida.'; end if;
 update hamacar.finance_revision set revision=revision+1;
 perform hamacar.audit('finance',new_id,'Economía: '||p_action,old_data,result,null,owner,'shared',coalesce(nullif(reason,''),note));
 return hamacar.operation_end(p_operation,jsonb_build_object('id',new_id,'version',new_version));
end $$;
alter table public.service_periods enable row level security;
alter table public.settlements enable row level security;
alter table public.collections enable row level security;
alter table public.transfers enable row level security;
create policy periods_read on public.service_periods for select to authenticated using(hamacar.finance_access(professional_id));
create policy settlements_read on public.settlements for select to authenticated using(hamacar.finance_access(professional_id));
create policy collections_read on public.collections for select to authenticated using(hamacar.finance_access(professional_id));
create policy transfers_read on public.transfers for select to authenticated using(exists(select 1 from public.settlements where id=settlement_id and hamacar.finance_access(professional_id)));
revoke all on public.service_periods,public.settlements,public.collections,public.transfers from anon,authenticated;
grant select on public.service_periods,public.settlements,public.collections,public.transfers to authenticated;
revoke execute on all functions in schema hamacar from public,anon,authenticated;
grant execute on function hamacar.active(),hamacar.partner(),hamacar.patient_access(uuid),hamacar.attachment_access(uuid),hamacar.finance_access(uuid) to authenticated;
revoke execute on function public.finance_command(text,jsonb,uuid) from public,anon;
grant execute on function public.finance_command(text,jsonb,uuid) to authenticated;
