import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const failure=(status:number)=>new Response(JSON.stringify({error:'Archivo no disponible o sesión vencida.'}),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return failure(405);
 const authorization=request.headers.get('authorization');
 if(!authorization?.startsWith('Bearer '))return failure(401);
 try{
  const url=Deno.env.get('SUPABASE_URL')!;
  const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error}=await client.auth.getUser(authorization.slice(7));
  if(error||!user)return failure(401);
  const {id}=await request.json();
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return failure(400);
  const {data:attachment,error:permission}=await client.from('attachments').select('bucket,path,mime_type').eq('id',id).single();
  if(permission||!attachment)return failure(403);
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:blob,error:download}=await admin.storage.from(attachment.bucket).download(attachment.path);
  if(download||!blob)return failure(404);
  // Recheck authorization after fetching the bytes, including assignment and inactivity.
  const {data:allowed}=await client.from('attachments').select('id').eq('id',id).maybeSingle();
  if(!allowed)return failure(403);
  return new Response(blob,{headers:{...cors,'Content-Type':'application/octet-stream','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'}});
 }catch{return failure(500);}
});
