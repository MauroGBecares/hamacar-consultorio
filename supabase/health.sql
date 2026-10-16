select jsonb_build_object(
 'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
 'publicTablesWithoutRls',(select coalesce(jsonb_agg(c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
 'anonymousBusinessFunctions',(select coalesce(jsonb_agg(p.proname),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname not like 'pg_%' and has_function_privilege('anon',p.oid,'EXECUTE')),
 'authenticatedTableWrites',(select coalesce(jsonb_agg(table_name||':'||privilege_type),'[]') from information_schema.role_table_grants where table_schema='public' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')),
 'authUsers',(select count(*) from auth.users),
 'patients',(select count(*) from public.patients),
 'profiles',(select count(*) from public.profiles),
 'attachments',(select count(*) from public.attachments),
 'storageObjects',(select count(*) from storage.objects where bucket_id in ('clinical-files','receipts')),
 'privateBuckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public,'maxBytes',file_size_limit)) from storage.buckets where id in ('clinical-files','receipts')),
 'cleanupSchedule',(select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active)) from cron.job where jobname='hamacar-cleanup-abandoned-uploads'),
 'cleanupCredentialPresent',(select count(*)=1 from vault.secrets where name='hamacar_cleanup_token'),
 'cleanupRecentRuns',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select d.status,d.start_time,d.end_time from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='hamacar-cleanup-abandoned-uploads' order by d.start_time desc limit 5)r),
 'recentHttpStatuses',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select status_code,timed_out,created from net._http_response order by created desc limit 5)r)
) as health;
