create function public.finance_slots(p_month date,p_professional uuid default null,p_cursor uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform hamacar.actor();
 if p_month is null or extract(day from p_month)<>1 then raise exception 'Período inválido.';end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from (
 select md5(t.professional_id::text||pt.id::text||p_month::text)::uuid as id,t.professional_id,pt.id as patient_id,pt.name as patient_name,p_month as month,
 null::text as mode,coalesce(pt.data->>'insurance','') as coverage,coalesce(pt.data->>'cud','') as cud,false as declared,false as complete,false as no_service,
 0 as performed,0 as sessions_paid,'[]'::jsonb as notes,1 as version,false as persisted
 from public.patient_team t join public.patients pt on pt.id=t.patient_id join public.profiles pr on pr.id=t.professional_id
 where pr.role='professional' and pr.active and pt.status<>'Archivado' and hamacar.finance_access(pr.id)
 and (p_professional is null or pr.id=p_professional)
 and not exists(select 1 from public.service_periods sp where sp.professional_id=pr.id and sp.patient_id=pt.id and sp.month=p_month)
 and (p_cursor is null or md5(t.professional_id::text||pt.id::text||p_month::text)::uuid>p_cursor)
 order by id limit least(200,greatest(1,p_limit)))x);
end $$;
create function public.home_summary(p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform hamacar.actor();
 return jsonb_build_object(
 'pendingCount',(select count(*) from public.transfers t join public.settlements s on s.id=t.settlement_id where t.state='informed' and hamacar.finance_access(s.professional_id)),
 'observedCount',(select count(distinct s.id) from public.transfers t join public.settlements s on s.id=t.settlement_id where t.state='observed' and hamacar.finance_access(s.professional_id)),
 'unincludedCount',(select count(*) from public.collections where not cancelled and settlement_id is null and hamacar.finance_access(professional_id)),
 'uncollectedCount',(select count(*) from public.service_periods where declared and not complete and month<p_month and hamacar.finance_access(professional_id)),
 'status',coalesce((select case
 when exists(select 1 from public.transfers where settlement_id=s.id and state='observed') then 'Para corregir'
 when exists(select 1 from public.transfers where settlement_id=s.id and state='informed') then 'Pendiente de revisión'
 when exists(select 1 from public.transfers where settlement_id=s.id and state='verified') then 'Confirmado'
 when exists(select 1 from public.collections where settlement_id=s.id and not cancelled) then 'Borrador' else 'Sin cargar' end
 from public.settlements s where professional_id=auth.uid() and month=p_month),'Sin cargar'));
end $$;
revoke execute on function public.finance_slots(date,uuid,uuid,integer),public.home_summary(date) from public,anon;
grant execute on function public.finance_slots(date,uuid,uuid,integer),public.home_summary(date) to authenticated;
