select jsonb_build_object(
 'tables',(select jsonb_agg(table_name order by table_name) from information_schema.tables where table_schema='public'),
 'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
 'authUserCount',(select count(*) from auth.users),
 'sessionColumns',(select jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'nullable',is_nullable,'default',column_default)) from information_schema.columns where table_schema='auth' and table_name='sessions'),
 'buckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public)) from storage.buckets)
);
