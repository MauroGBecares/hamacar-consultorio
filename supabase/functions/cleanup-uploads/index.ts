import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
Deno.serve(async request => {
  const token = Deno.env.get('HAMACAR_CLEANUP_TOKEN');
  // A dedicated server token avoids depending on gateway rewrites of API credentials.
  if (request.method !== 'POST' || !token || request.headers.get('x-hamacar-cleanup-token') !== token) return new Response('Unauthorized', { status: 401 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('upload_cleanup_claim');
  if (error) return Response.json({ error: 'No se pudo iniciar la limpieza.' }, { status: 500 });
  let deleted = 0, failed = 0;
  for (const file of data) {
    const { error: removeError } = await admin.storage.from(file.bucket).remove([file.path]);
    if (removeError) { failed++; continue; }
    const { error: doneError } = await admin.rpc('upload_cleanup_done', { p_id: file.id });
    if (doneError) failed++; else deleted++;
  }
  return Response.json({ deleted, failed }, { status: failed ? 503 : 200 });
});
