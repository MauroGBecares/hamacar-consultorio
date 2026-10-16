import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { validateFile } from '../_shared/files.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response({ error: 'Método inválido.' }, 405);
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Ingresá para continuar.' }, 401);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user }, error: authError } = await client.auth.getUser(authorization.slice(7));
    if (authError || !user) return response({ error: 'Sesión inválida.' }, 401);
    const { id } = await request.json();
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return response({ error: 'Carga inválida.' }, 400);
    const { data: attachment, error: permissionError } = await client.rpc('upload_check', { p_id: id });
    if (permissionError) return response({ error: 'Carga no disponible o sesión vencida.' }, 403);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: blob, error: downloadError } = await admin.storage.from(attachment.bucket).download(attachment.path);
    if (downloadError || !blob) return response({ error: 'La carga no terminó. Reintentá la carga del archivo.' }, 409);
    if (blob.size !== attachment.size) return response({ error: 'El tamaño del archivo no coincide.' }, 422);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    try { await validateFile(bytes, attachment.mime_type, attachment.name); }
    catch { return response({ error: 'El archivo no tiene una estructura válida para su formato, está incompleto o supera los límites admitidos.' }, 422); }
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    // getUser verified the token before its session_id is consumed.
    const claims = JSON.parse(atob(authorization.slice(7).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const { data, error } = await admin.rpc('upload_finalize', { p_id: id, p_owner: user.id, p_session: claims.session_id, p_sha256: sha, p_size: blob.size, p_type: attachment.mime_type });
    if (error) return response({ error: 'La carga venció o cambió su autorización. Volvé a cargar el archivo.' }, 409);
    return response(data);
  } catch { return response({ error: 'No se pudo validar el archivo. Reintentá.' }, 500); }
});
