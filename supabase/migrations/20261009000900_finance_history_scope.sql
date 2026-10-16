create function public.finance_scope(p_query jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb; kind text; ref_month date:=(p_query->>'month')::date;
 owner uuid:=nullif(p_query->>'professionalId','')::uuid; after_id uuid:=nullif(p_query->>'cursor','')::uuid;
 attention text:=coalesce(p_query->>'attention',''); filter text:=coalesce(p_query->>'status','Todas');
begin
 perform hamacar.actor();
 if ref_month is null then raise exception 'Elegí un mes de referencia.'; end if;
 if attention in ('uncollected','unincluded') then
  kind:='periods';
  select coalesce(jsonb_agg(x.id order by x.id),'[]') into items from (
   select p.id from public.service_periods p where hamacar.finance_access(p.professional_id)
   and (owner is null or p.professional_id=owner) and (after_id is null or p.id>after_id)
   and case when attention='uncollected' then p.declared and not p.complete and p.month<ref_month
   else exists(select 1 from public.collections c where c.period_id=p.id and c.settlement_id is null and not c.cancelled) end
   order by p.id limit 50
  )x;
 else
  kind:='settlements';
  select coalesce(jsonb_agg(x.id order by x.id),'[]') into items from (
   select s.id from public.settlements s where hamacar.finance_access(s.professional_id)
   and (owner is null or s.professional_id=owner) and (after_id is null or s.id>after_id)
   and case when attention in ('observed','informed') then exists(select 1 from public.transfers t where t.settlement_id=s.id and t.state=attention)
   else s.month<=ref_month end
   and case when filter='Para corregir' then exists(select 1 from public.transfers t where t.settlement_id=s.id and t.state='observed')
   when filter in ('Confirmadas','Pendientes') then (exists(select 1 from public.transfers t where t.settlement_id=s.id and t.state='verified')
   and not exists(select 1 from public.transfers t where t.settlement_id=s.id and t.state in ('informed','observed')))=(filter='Confirmadas') else true end
   order by s.id limit 50
  )x;
 end if;
 return jsonb_build_object('kind',kind,'ids',items,'revision',(select revision from hamacar.finance_revision),
 'nextCursor',case when jsonb_array_length(items)=50 then items->>-1 else null end);
end $$;
revoke all on function public.finance_scope(jsonb) from public,anon;
grant execute on function public.finance_scope(jsonb) to authenticated;

do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.finance_page(jsonb)'::regprocedure);
 definition:=replace(definition,'target uuid:=',
 'scope_kind text:=p_query->''scope''->>''kind''; scope_ids uuid[]:=array(select jsonb_array_elements_text(coalesce(p_query->''scope''->''ids'',''[]''::jsonb))::uuid); target uuid:=');
 definition:=replace(definition,'and (target is null or p.id=target)',
 'and (scope_kind is null or (scope_kind=''periods'' and p.id=any(scope_ids)) or (scope_kind=''settlements'' and exists(select 1 from public.collections c where c.period_id=p.id and c.settlement_id=any(scope_ids)))) and (target is null or p.id=target)');
 definition:=replace(definition,'and (target is null or s.id=target)',
 'and (scope_kind is null or (scope_kind=''settlements'' and s.id=any(scope_ids)) or (scope_kind=''periods'' and exists(select 1 from public.collections c where c.settlement_id=s.id and c.period_id=any(scope_ids)))) and (target is null or s.id=target)');
 definition:=replace(definition,'and (target is null or c.period_id=target or c.settlement_id=target)',
 'and (scope_kind is null or (scope_kind=''periods'' and c.period_id=any(scope_ids)) or (scope_kind=''settlements'' and c.settlement_id=any(scope_ids))) and (target is null or c.period_id=target or c.settlement_id=target)');
 execute definition;
end $$;
notify pgrst,'reload schema';
