create function public.patient_duplicates(p_name text,p_except uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform hamacar.actor();
 return coalesce((select jsonb_agg(case when hamacar.patient_access(id) then jsonb_build_object('accessible',true,'id',id,'name',name)
 else jsonb_build_object('accessible',false) end) from public.patients
 where (p_except is null or id<>p_except) and extensions.unaccent(lower(trim(name)))=extensions.unaccent(lower(trim(p_name)))),'[]');
end $$;
create function public.patient_command(p_action text,p_input jsonb,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hamacar.actor(); target uuid:=nullif(p_input->>'id','')::uuid; old public.patients; next public.patients;
 result jsonb; d jsonb:=p_input->'data'; ids uuid[]; k text; v text; new_status text:=p_input->>'status';
begin
 -- Shares the agenda lock so a simultaneous team change cannot authorize a stale booking.
 perform pg_advisory_xact_lock(78341001);
 if target is not null then old:=hamacar.patient_require(target,p_action='save'); end if;
 if p_action='manage' and not hamacar.partner() then raise exception using errcode='42501',message='Acción reservada a socias.'; end if;
 result:=hamacar.operation_begin('patient:'||p_action,p_input,p_operation); if result is not null then return result; end if;
 if target is not null and old.version is distinct from (p_input->>'version')::integer then
 raise exception using errcode='40001',message='La ficha cambió. Recargá antes de guardar.'; end if;
 if p_action='save' then
   if d is null or jsonb_typeof(d)<>'object' then raise exception 'Datos incompletos.'; end if;
   for k,v in select * from jsonb_each_text(d) loop
     if k not in ('name','birthDate','admission','school','insurance','cud','diagnosis','reason','family','relation','contact','referral','reentry')
     or length(v)>(case when k='reason' then 2000 else 200 end) then raise exception 'Campo inválido o demasiado largo.'; end if;
     d:=jsonb_set(d,array[k],to_jsonb(trim(coalesce(v,''))));
   end loop;
   if not(d ?& array['name','birthDate','admission','school','insurance','cud','diagnosis','reason','family','relation','contact','referral','reentry'])
   or length(d->>'name')<3 or (d->>'admission')::date>hamacar.today() or
   nullif(d->>'birthDate','')::date>(d->>'admission')::date or
   d->>'cud' not in ('Sí','No','No informado') or d->>'reentry' not in ('Sí','No') then raise exception 'Revisá los datos y fechas del paciente.'; end if;
   if jsonb_array_length(public.patient_duplicates(d->>'name',target))>0 and not coalesce((p_input->>'duplicateAcknowledged')::boolean,false)
   then raise exception using errcode='23505',message='Revisá la coincidencia de nombre antes de guardar.'; end if;
   if target is null then
     insert into public.patients(name,birth_date,admission,data,created_by) values(d->>'name',nullif(d->>'birthDate','')::date,(d->>'admission')::date,d,u) returning * into next;
     insert into public.patient_team values(next.id,u);
   else
     update public.patients set name=d->>'name',birth_date=nullif(d->>'birthDate','')::date,admission=(d->>'admission')::date,data=d,version=version+1 where id=target returning * into next;
   end if;
 elsif p_action='manage' and target is not null then
   select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p_input->'professionalIds');
   if coalesce(cardinality(ids),0)=0 or exists(select 1 from unnest(ids) t where not exists(select 1 from public.profiles where id=t and active)) then raise exception 'Asigná al menos una profesional activa.'; end if;
   if new_status is null or new_status not in ('Activo','En pausa','Archivado') or (new_status<>old.status and length(trim(coalesce(p_input->>'reason','')))=0) then raise exception 'Revisá estado y motivo.'; end if;
   update public.patients set status=new_status,version=version+1,
    closed_at=case when new_status=old.status then old.closed_at when new_status='Archivado' then hamacar.today() else null end,
    close_reason=case when new_status=old.status then old.close_reason when new_status='Archivado' then trim(p_input->>'reason') else null end
   where id=target returning * into next;
   delete from public.patient_team where patient_id=target and not(professional_id=any(ids));
   insert into public.patient_team select target,unnest(ids) on conflict do nothing;
 else raise exception 'Operación inválida.';
 end if;
 perform hamacar.audit('patients',next.id,case when old.id is null then 'Paciente creado' else 'Paciente actualizado' end,
 to_jsonb(old),to_jsonb(next)||jsonb_build_object('team',p_input->'professionalIds'),next.id,null,'shared',coalesce(p_input->>'reason',''));
 return hamacar.operation_end(p_operation,jsonb_build_object('id',next.id,'version',next.version));
end $$;

create function public.clinical_command(p_action text,p_input jsonb,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hamacar.actor(); patient uuid:=(p_input->>'patientId')::uuid; visibility text:=p_input->>'visibility';
 d public.clinical_drafts; r public.clinical_records; original public.clinical_records;
 result jsonb; file_ids uuid[]; fid uuid; a public.attachments; record_date date:=(p_input->>'date')::date; body text:=coalesce(p_input->>'text','');
begin
 perform hamacar.patient_require(patient,true);
 if visibility is null or visibility not in ('shared','private') then raise exception 'Visibilidad inválida.'; end if;
 result:=hamacar.operation_begin('clinical:'||p_action,p_input,p_operation); if result is not null then return result; end if;
 select * into d from public.clinical_drafts where patient_id=patient and author_id=u and clinical_drafts.visibility=clinical_command.visibility for update;
 if coalesce(d.version,0) is distinct from (p_input->>'version')::integer then raise exception using errcode='40001',message='Otro editor cambió el borrador. Conservá tu texto y compará las versiones.'; end if;
 if record_date is null or record_date>hamacar.today() or length(body)>200000 then raise exception 'Fecha o texto inválido.'; end if;
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into file_ids from jsonb_array_elements_text(coalesce(p_input->'files','[]'));
 if cardinality(file_ids)>5 or cardinality(file_ids)<>(select count(distinct x) from unnest(file_ids)x) then raise exception 'Podés adjuntar hasta cinco archivos diferentes.'; end if;
 foreach fid in array file_ids loop
   select * into a from public.attachments where id=fid for update;
   if a.id is null or a.owner_id<>u or a.patient_id<>patient or a.visibility<>visibility or a.purpose<>'clinical' or a.state<>'validated'
   or a.record_id is not null or a.transfer_id is not null or (a.draft_id is not null and a.draft_id is distinct from d.id) then raise exception using errcode='42501',message='Adjunto no disponible para este registro.'; end if;
 end loop;
 if p_action='draft' then
   if d.id is null then
     insert into public.clinical_drafts(patient_id,author_id,visibility,date,text) values(patient,u,visibility,record_date,body) returning * into d;
   else
     update public.clinical_drafts set date=record_date,text=body,version=version+1,updated_at=now() where id=d.id returning * into d;
   end if;
   update public.attachments set draft_id=null where draft_id=d.id and not(id=any(file_ids));
   update public.attachments set draft_id=d.id where id=any(file_ids);
   return hamacar.operation_end(p_operation,jsonb_build_object('id',d.id,'version',d.version));
 elsif p_action='publish' then
   if length(trim(body))=0 and cardinality(file_ids)=0 then raise exception 'Escribí un registro o adjuntá un informe.'; end if;
   if nullif(p_input->>'correctsRecordId','') is not null then
     select * into original from public.clinical_records where id=(p_input->>'correctsRecordId')::uuid;
     if original.id is null or original.patient_id<>patient or original.author_id<>u or original.visibility<>visibility
     or length(trim(coalesce(p_input->>'correctionReason','')))=0 then raise exception 'Rectificación inválida: requiere registro propio, igual visibilidad y motivo.'; end if;
   end if;
   insert into public.clinical_records(patient_id,author_id,visibility,date,text,corrects_record_id,correction_reason)
   values(patient,u,visibility,record_date,trim(body),original.id,nullif(trim(p_input->>'correctionReason'),'')) returning * into r;
   update public.attachments set draft_id=null where draft_id=d.id;
   update public.attachments set record_id=r.id where id=any(file_ids);
   delete from public.clinical_drafts where id=d.id;
   perform hamacar.audit('clinical',r.id,case when original.id is null then 'Registro publicado' else 'Rectificación publicada' end,null,to_jsonb(r),patient,u,visibility,coalesce(p_input->>'correctionReason',''));
   return hamacar.operation_end(p_operation,jsonb_build_object('id',r.id,'version',0));
 else raise exception 'Operación inválida.'; end if;
end $$;
revoke execute on function public.patient_duplicates(text,uuid),public.patient_command(text,jsonb,uuid),public.clinical_command(text,jsonb,uuid) from public,anon;
grant execute on function public.patient_duplicates(text,uuid),public.patient_command(text,jsonb,uuid),public.clinical_command(text,jsonb,uuid) to authenticated;
