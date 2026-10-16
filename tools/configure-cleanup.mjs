import { randomBytes } from 'node:crypto';
// Both secret destinations are configured from memory; never log request bodies or credentials.
const token = process.env.HAMACAR_TEST_MANAGEMENT_TOKEN;
if (!token) throw new Error('Ejecutar con supabase-admin.ps1 -Action test.');
const base = 'https://api.supabase.com/v1/projects/imuawsrkrrhzhaxyfmcy';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const key = randomBytes(32).toString('hex');
const secrets = await fetch(base + '/secrets', {
  method: 'POST',
  headers,
  body: JSON.stringify([{ name: 'HAMACAR_CLEANUP_TOKEN', value: key }]),
});
if (!secrets.ok) throw new Error('No se pudo configurar el secreto de la función.');
const query = `do $safe$ declare secret_id uuid; begin
 select id into secret_id from vault.secrets where name='hamacar_cleanup_token';
 if secret_id is null then perform vault.create_secret('${key}','hamacar_cleanup_token','Token exclusivo de limpieza Hamacar');
 else perform vault.update_secret(secret_id,'${key}','hamacar_cleanup_token','Token exclusivo de limpieza Hamacar');end if;
end $safe$;`;
const response = await fetch(base + '/database/query', {
  method: 'POST',
  headers,
  body: JSON.stringify({ query }),
});
if (!response.ok)
  throw new Error(
    'No se pudo configurar Vault. Repetí la operación para sincronizar ambos destinos.',
  );
console.log('Token exclusivo de limpieza configurado en Vault y Edge Functions.');
