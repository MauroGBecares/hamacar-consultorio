import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
for (const path of ['.env.local', '.env']) {
  if (existsSync(path)) process.loadEnvFile(path);
}
const supabaseUrl = process.env.HAMACAR_SUPABASE_URL;
const supabasePublishableKey = process.env.HAMACAR_SUPABASE_PUBLISHABLE_KEY;
if (
  !supabaseUrl ||
  !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl) ||
  !supabasePublishableKey?.startsWith('sb_publishable_')
) {
  throw new Error(
    'Configurá HAMACAR_SUPABASE_URL y HAMACAR_SUPABASE_PUBLISHABLE_KEY. Nunca uses una clave secret o service_role en Angular.',
  );
}
mkdirSync('public', { recursive: true });
writeFileSync('public/app-config.json', JSON.stringify({ supabaseUrl, supabasePublishableKey }));
