create function public.finance_dashboard(p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare monthly jsonb; history jsonb; details jsonb; last_day date:=(p_month+interval '1 month - 1 day')::date;
begin
 perform hamacar.actor();
 monthly:=public.finance_summary(p_month,last_day);
 history:=public.finance_summary((p_month-interval '5 months')::date,last_day);
 with payments as (
   select t.*,s.professional_id,p.full_name,p.discipline,
   (select count(*)=1 from public.transfers where settlement_id=s.id and state='verified') and
   t.amount_cents=(select coalesce(sum(contribution_cents),0) from public.collections where settlement_id=s.id and not cancelled) as allocatable
   from public.transfers t join public.settlements s on s.id=t.settlement_id join public.profiles p on p.id=s.professional_id
   where hamacar.finance_access(s.professional_id) and t.state='verified' and t.date between p_month and last_day
 ), portions as (
   select 'professional' as perspective,full_name as name,amount_cents as cents from payments union all
   select 'discipline',discipline,amount_cents from payments union all
   select 'mode',case when x.allocatable then c.mode else 'Sin distribuir (sin imputación explícita)' end,
     case when x.allocatable then c.contribution_cents else x.amount_cents end
   from payments x left join public.collections c on x.allocatable and c.settlement_id=x.settlement_id and not c.cancelled union all
   select 'coverage',case when x.allocatable then case when c.mode='Particular' then 'Particular' else coalesce(nullif(c.coverage,''),'Sin cobertura informada') end else 'Sin distribuir (sin imputación explícita)' end,
     case when x.allocatable then c.contribution_cents else x.amount_cents end
   from payments x left join public.collections c on x.allocatable and c.settlement_id=x.settlement_id and not c.cancelled
 ), sums as (select perspective,name,sum(cents) as cents from portions group by perspective,name),
 groups as (select perspective,jsonb_agg(jsonb_build_array(name,cents) order by cents desc,name) as rows from sums group by perspective)
 select coalesce(jsonb_object_agg(perspective,rows),'{}') into details from groups;
 return monthly||jsonb_build_object('chart',history->'byMonth','details',details,'alerts',public.home_summary(p_month),
 'notStarted',(select count(*) from public.profiles p where p.active and p.role='professional' and hamacar.finance_access(p.id)
 and not exists(select 1 from public.settlements s where s.professional_id=p.id and s.month=p_month and
 (exists(select 1 from public.collections where settlement_id=s.id and not cancelled) or exists(select 1 from public.transfers where settlement_id=s.id)))),
 'confirmed',(select count(*) from public.settlements s where s.month=p_month and hamacar.finance_access(s.professional_id)
 and exists(select 1 from public.transfers where settlement_id=s.id and state='verified') and not exists(select 1 from public.transfers where settlement_id=s.id and state in ('informed','observed'))));
end $$;
revoke execute on function public.finance_dashboard(date) from public,anon;
grant execute on function public.finance_dashboard(date) to authenticated;
