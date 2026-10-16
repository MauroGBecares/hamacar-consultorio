-- A narrowly scoped random token is shared by the scheduled job and its Edge Function.
-- configure-cleanup.mjs provisions it in Vault and Edge secrets, never in this migration.
select cron.schedule('hamacar-cleanup-abandoned-uploads','15 6 * * *',
 $job$select net.http_post(
   url:='https://imuawsrkrrhzhaxyfmcy.supabase.co/functions/v1/cleanup-uploads',
   headers:=jsonb_build_object('x-hamacar-cleanup-token',(select decrypted_secret from vault.decrypted_secrets where name='hamacar_cleanup_token'),'Content-Type','application/json'),
   body:='{}'::jsonb,timeout_milliseconds:=60000
 );$job$);
delete from vault.secrets where name='hamacar_cleanup_service_role';
