create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- The credential is installed separately into Vault, never into a migration or the frontend.
select cron.schedule('hamacar-cleanup-abandoned-uploads','15 6 * * *',
 $job$select net.http_post(
   url:='https://imuawsrkrrhzhaxyfmcy.supabase.co/functions/v1/cleanup-uploads',
   headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='hamacar_cleanup_service_role'),'Content-Type','application/json'),
   body:='{}'::jsonb,timeout_milliseconds:=60000
 );$job$);
