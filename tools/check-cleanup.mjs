// Reads only this job's token into memory and never logs it.
const token = process.env.HAMACAR_TEST_MANAGEMENT_TOKEN;
if (!token) throw new Error('Ejecutar con supabase-admin.ps1 -Action test.');
const query = await fetch(
  'https://api.supabase.com/v1/projects/imuawsrkrrhzhaxyfmcy/database/query',
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:
        "select decrypted_secret as token from vault.decrypted_secrets where name='hamacar_cleanup_token'",
    }),
  },
);
if (!query.ok) throw new Error('No se pudo consultar la configuración de limpieza.');
const [{ token: cleanupToken }] = await query.json();
const response = await fetch(
  'https://imuawsrkrrhzhaxyfmcy.supabase.co/functions/v1/cleanup-uploads',
  {
    method: 'POST',
    headers: { 'x-hamacar-cleanup-token': cleanupToken, 'Content-Type': 'application/json' },
    body: '{}',
  },
);
console.log(
  JSON.stringify({ status: response.status, body: (await response.text()).slice(0, 500) }),
);
if (!response.ok) process.exitCode = 1;
else {
  const scheduled = await fetch(
    'https://api.supabase.com/v1/projects/imuawsrkrrhzhaxyfmcy/database/query',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:
          "do $$ declare job_command text; begin select command into strict job_command from cron.job where jobname='hamacar-cleanup-abandoned-uploads'; execute job_command; end $$;",
      }),
    },
  );
  if (!scheduled.ok) throw new Error('No se pudo ejecutar el comando del trabajo programado.');
  console.log(
    'Comando del trabajo enviado por pg_net; comprobar recentHttpStatuses en health.sql.',
  );
}
