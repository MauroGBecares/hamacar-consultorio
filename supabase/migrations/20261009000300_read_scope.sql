-- Disambiguate date columns from the requested cycle.
create or replace function public.finance_page(p_query jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
<<finance_page>>
declare items jsonb; rev bigint; take integer:=least(200,greatest(1,coalesce((p_query->>'limit')::integer,50)));
 after_id uuid:=nullif(p_query->>'cursor','')::uuid; owner uuid:=nullif(p_query->>'professionalId','')::uuid;
 month date:=nullif(p_query->>'month','')::date; entity text:=p_query->>'entity'; target uuid:=nullif(p_query->>'target','')::uuid;
begin
 perform hamacar.actor();
 select revision into rev from hamacar.finance_revision;
 if nullif(p_query->>'revision','') is not null and (p_query->>'revision')::bigint<>rev then raise exception using errcode='40001',message='Los datos económicos cambiaron. Volvé a generar la consulta o el informe.'; end if;
 if entity='periods' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into items from (
     select p.* from public.service_periods p where hamacar.finance_access(p.professional_id)
     and (owner is null or p.professional_id=owner) and (finance_page.month is null or p.month=finance_page.month)
     and (target is null or p.id=target) and (after_id is null or p.id>after_id) order by p.id limit take
   )x;
 elsif entity='settlements' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into items from (
     select s.* from public.settlements s where hamacar.finance_access(s.professional_id)
     and (owner is null or s.professional_id=owner) and (finance_page.month is null or s.month=finance_page.month)
     and (target is null or s.id=target) and (after_id is null or s.id>after_id) order by s.id limit take
   )x;
 elsif entity='collections' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into items from (
     select c.* from public.collections c join public.service_periods p on p.id=c.period_id left join public.settlements s on s.id=c.settlement_id
     where hamacar.finance_access(c.professional_id) and (owner is null or c.professional_id=owner)
     and (finance_page.month is null or p.month=finance_page.month or s.month=finance_page.month or (c.settlement_id is null and date_trunc('month',c.date)::date<=finance_page.month))
     and (target is null or c.period_id=target or c.settlement_id=target)
     and (after_id is null or c.id>after_id) order by c.id limit take
   )x;
 elsif entity='transfers' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into items from (
     select t.*,p.full_name as verified_by_name,jsonb_build_object('id',a.id,'name',a.name,'size',a.size,'type',a.mime_type) as receipt
     from public.transfers t join public.settlements s on s.id=t.settlement_id join public.attachments a on a.id=t.receipt_id
     left join public.profiles p on p.id=t.verified_by
     where hamacar.finance_access(s.professional_id) and (owner is null or s.professional_id=owner)
     and (finance_page.month is null or s.month=finance_page.month) and (target is null or s.id=target)
     and (after_id is null or t.id>after_id) order by t.id limit take
   )x;
 else raise exception 'Consulta económica inválida.'; end if;
 return jsonb_build_object('items',items,'revision',rev,'nextCursor',case when jsonb_array_length(items)=take then items->-1->>'id' else null end);
end $$;
