-- Supabase enables safeupdate for API connections. Explicitly target the singleton.
do $$
begin
 execute replace(pg_get_functiondef('hamacar.finance_command_validated(text,jsonb,uuid)'::regprocedure),
 'update hamacar.finance_revision set revision=revision+1;',
 'update hamacar.finance_revision set revision=revision+1 where id=true;');
end $$;
