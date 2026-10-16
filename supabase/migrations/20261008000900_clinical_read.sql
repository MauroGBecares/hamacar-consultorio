create function public.clinical_page(p_query jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
<<clinical_page>>
declare patient uuid:=(p_query->>'patientId')::uuid; visibility text:=p_query->>'visibility'; cursor_record public.clinical_records;
begin
 perform hamacar.actor();
 if not hamacar.patient_access(patient) then raise exception using errcode='42501',message='Paciente no disponible.';end if;
 if nullif(p_query->>'cursor','') is not null then
   select * into cursor_record from public.clinical_records where id=(p_query->>'cursor')::uuid and patient_id=patient and
   clinical_records.visibility=clinical_page.visibility and (clinical_records.visibility='shared' or author_id=auth.uid());
   if cursor_record.id is null then raise exception 'Página no disponible.';end if;
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'patientId',r.patient_id,'authorId',r.author_id,'author',p.full_name,'discipline',p.discipline,
 'visibility',r.visibility,'date',r.date,'text',r.text,'publishedAt',r.published_at,'version',0,'correctsRecordId',r.corrects_record_id,'correctionReason',r.correction_reason,
 'files',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'size',a.size,'type',a.mime_type,'url','','lastModified',0,'persisted',true)),'[]') from public.attachments a where a.record_id=r.id))
 order by r.date desc,r.published_at desc,r.id desc),'[]') from (
 select * from public.clinical_records c where c.patient_id=patient and c.visibility=clinical_page.visibility and (c.visibility='shared' or c.author_id=auth.uid())
 and (not coalesce((p_query->>'documentsOnly')::boolean,false) or exists(select 1 from public.attachments where record_id=c.id))
 and (cursor_record.id is null or (c.date,c.published_at,c.id)<(cursor_record.date,cursor_record.published_at,cursor_record.id))
 order by c.date desc,c.published_at desc,c.id desc limit least(200,greatest(1,coalesce((p_query->>'limit')::integer,50)))
 )r join public.profiles p on p.id=r.author_id);
end $$;
revoke execute on function public.clinical_page(jsonb) from public,anon;
grant execute on function public.clinical_page(jsonb) to authenticated;
