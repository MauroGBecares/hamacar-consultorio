insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('clinical-files','clinical-files',false,10485760,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']),
 ('receipts','receipts',false,10485760,array['application/pdf','image/jpeg','image/png']);
create function public.upload_reserve(p_input jsonb,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hamacar.actor(); purpose text:=p_input->>'purpose'; a public.attachments; result jsonb;
 patient uuid:=nullif(p_input->>'patientId','')::uuid; settlement uuid:=nullif(p_input->>'settlementId','')::uuid;
begin
 if purpose='clinical' then perform hamacar.patient_require(patient,true);
 elsif purpose='receipt' then
   if not exists(select 1 from public.settlements s join public.profiles p on p.id=s.professional_id where s.id=settlement and p.id=u and p.role='professional') then raise exception using errcode='42501',message='Liquidación no disponible.'; end if;
 else raise exception 'Destino de archivo inválido.'; end if;
 result:=hamacar.operation_begin('upload:reserve',p_input,p_operation); if result is not null then return result; end if;
 if (p_input->>'name') ~ '[/\\]' or (p_input->>'name') ~ '[[:cntrl:]]' then raise exception 'Nombre de archivo inválido.'; end if;
 if p_input->>'type' not in ('application/pdf','image/jpeg','image/png') and
 not(purpose='clinical' and p_input->>'type' in ('application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')) then raise exception 'Formato no admitido.'; end if;
 insert into public.attachments(owner_id,purpose,patient_id,settlement_id,visibility,bucket,path,name,size,mime_type)
 values(u,purpose,patient,settlement,case when purpose='clinical' then p_input->>'visibility' else null end,
 case when purpose='clinical' then 'clinical-files' else 'receipts' end,u::text||'/'||gen_random_uuid()::text,p_input->>'name',(p_input->>'size')::integer,p_input->>'type') returning * into a;
 return hamacar.operation_end(p_operation,jsonb_build_object('id',a.id,'bucket',a.bucket,'path',a.path));
end $$;
create function public.upload_check(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=hamacar.actor(); a public.attachments;
begin
 select * into a from public.attachments where id=p_id;
 if a.id is null or a.owner_id<>u or a.state not in ('reserved','validated') then raise exception using errcode='42501',message='Carga no disponible.'; end if;
 if a.purpose='clinical' then perform hamacar.patient_require(a.patient_id,true); end if;
 return to_jsonb(a);
end $$;
create function public.upload_finalize(p_id uuid,p_owner uuid,p_session uuid,p_sha256 text,p_size integer,p_type text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.attachments;
begin
 if not exists(select 1 from hamacar.app_sessions s join auth.sessions au on au.id=s.id join public.profiles p on p.id=s.user_id
 where s.id=p_session and s.user_id=p_owner and p.active and s.revoked_at is null and s.last_activity>now()-interval '30 minutes') then raise exception 'Sesión vencida.'; end if;
 select * into a from public.attachments where id=p_id for update;
 if a.id is null or a.owner_id<>p_owner or a.state not in ('reserved','validated') or a.size<>p_size or a.mime_type<>p_type or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Archivo inválido o carga vencida.'; end if;
 if a.purpose='clinical' and not exists(select 1 from public.patients pt where pt.id=a.patient_id and pt.status<>'Archivado' and
 (exists(select 1 from public.profiles where id=p_owner and role='partner') or exists(select 1 from public.patient_team where patient_id=a.patient_id and professional_id=p_owner))) then raise exception 'Paciente no disponible.'; end if;
 if a.state='validated' and a.sha256<>p_sha256 then raise exception 'No se permite reemplazar un archivo.'; end if;
 update public.attachments set state='validated',sha256=p_sha256,validated_at=coalesce(validated_at,now()) where id=p_id returning * into a;
 return jsonb_build_object('id',a.id,'name',a.name,'size',a.size,'type',a.mime_type);
end $$;
create function public.upload_cleanup_claim() returns setof public.attachments language sql security definer set search_path='' as $$
 update public.attachments set state='deleting' where id in (
 select id from public.attachments where state in ('reserved','validated','deleting') and created_at<now()-interval '24 hours'
 and record_id is null and draft_id is null and transfer_id is null order by created_at limit 100 for update skip locked
 ) returning *
$$;
create function public.upload_cleanup_done(p_id uuid) returns void language sql security definer set search_path='' as $$
 update public.attachments set state='deleted' where id=p_id and state='deleting' and record_id is null and draft_id is null and transfer_id is null
$$;
create policy hamacar_upload on storage.objects for insert to authenticated with check(
 hamacar.active() and exists(select 1 from public.attachments a where a.bucket=bucket_id and a.path=name and a.owner_id=auth.uid() and a.state='reserved'
 and (a.purpose='receipt' or hamacar.patient_access(a.patient_id)))
);
-- RLS on attachments intentionally hides unvalidated files; use a narrow definer predicate for upload authorization.
create function hamacar.can_upload(bucket text,path text) returns boolean language sql stable security definer set search_path='' as $$
 select hamacar.active() and exists(select 1 from public.attachments a where a.bucket=can_upload.bucket and a.path=can_upload.path and a.owner_id=auth.uid() and a.state='reserved'
 and a.created_at>now()-interval '24 hours' and (a.purpose='receipt' or hamacar.patient_access(a.patient_id)))
$$;
drop policy hamacar_upload on storage.objects;
create policy hamacar_upload on storage.objects for insert to authenticated with check(hamacar.can_upload(bucket_id,name));
create policy hamacar_download on storage.objects for select to authenticated using(exists(select 1 from public.attachments a where a.bucket=bucket_id and a.path=name and hamacar.attachment_access(a.id)));
revoke execute on function public.upload_reserve(jsonb,uuid),public.upload_check(uuid),public.upload_finalize(uuid,uuid,uuid,text,integer,text),public.upload_cleanup_claim(),public.upload_cleanup_done(uuid) from public,anon,authenticated;
grant execute on function public.upload_reserve(jsonb,uuid),public.upload_check(uuid) to authenticated;
grant execute on function public.upload_finalize(uuid,uuid,uuid,text,integer,text),public.upload_cleanup_claim(),public.upload_cleanup_done(uuid) to service_role;
revoke execute on all functions in schema hamacar from public,anon,authenticated;
grant execute on function hamacar.active(),hamacar.partner(),hamacar.patient_access(uuid),hamacar.attachment_access(uuid),hamacar.finance_access(uuid),hamacar.can_upload(text,text) to authenticated;
