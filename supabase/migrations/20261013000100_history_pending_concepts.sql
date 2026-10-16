-- A historical settlement with no transfers can still include eligible pending collections.
-- Keep the same authorized scope and cursor; do not load unrelated professionals' history.
do $$
declare definition text; old_filter text; new_filter text;
begin
 definition:=pg_get_functiondef('public.finance_page(jsonb)'::regprocedure);
 old_filter:='(scope_kind=''settlements'' and c.settlement_id=any(scope_ids))';
 new_filter:='(scope_kind=''settlements'' and (c.settlement_id=any(scope_ids) or
   (c.settlement_id is null and not c.cancelled and exists(
     select 1 from public.settlements pending_settlement
     where pending_settlement.id=any(scope_ids)
     and pending_settlement.professional_id=c.professional_id
     and c.date<pending_settlement.month+interval ''1 month''
     and not exists(select 1 from public.transfers payment where payment.settlement_id=pending_settlement.id)
   ))))';
 if position(old_filter in definition)=0 then raise exception 'Contrato finance_page inesperado'; end if;
 execute replace(definition,old_filter,new_filter);
end $$;
notify pgrst,'reload schema';
