-- 40001 is reserved for transient serialization failures and PostgREST retries it.
-- Expected version conflicts are definitive HTTP 409 responses.
do $$
declare f record;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','hamacar') and p.prokind='f' and p.prosrc like '%''40001''%'
 loop
  execute replace(pg_get_functiondef(f.oid),'''40001''','''PT409''');
 end loop;
end $$;

-- Reject fractional and out-of-range quantities before casts can round them.
alter function public.finance_command(text,jsonb,uuid) rename to finance_command_validated;
revoke all on function public.finance_command_validated(text,jsonb,uuid) from public,anon,authenticated;
alter function public.finance_command_validated(text,jsonb,uuid) set schema hamacar;
create function public.finance_command(p_action text,p_input jsonb,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text; v text;
begin
 perform hamacar.actor();
 foreach k in array array['contributionCents','receivedCents','amountCents','sessionsPaid','performed'] loop
  v:=p_input->>k;
  if v is not null and (v !~ '^[0-9]{1,13}$' or v::numeric>case when k in ('sessionsPaid','performed') then 1000000 else 9000000000000 end) then
   raise exception 'Importes y sesiones deben ser enteros válidos dentro del límite permitido.';
  end if;
 end loop;
 if p_action='correct' and exists(select 1 from public.collections where id=(p_input->>'id')::uuid and mode='Cobertura')
 and p_input->>'receivedCents' is null then raise exception 'Indicá el importe recibido de la cobertura.'; end if;
 return hamacar.finance_command_validated(p_action,p_input,p_operation);
end $$;
revoke all on function public.finance_command(text,jsonb,uuid) from public,anon;
grant execute on function public.finance_command(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
