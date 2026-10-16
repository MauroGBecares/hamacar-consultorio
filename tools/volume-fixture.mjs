/** Temporary, synthetic historical rows; integration cleanup owns them by author UUID. */
export async function volumeFixture({ sql, owner, partner, patient, month, run }) {
  for (const id of [owner, partner, patient, run])
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('UUID inválido');
  await sql(`begin;
  insert into public.service_periods(id,professional_id,patient_id,patient_name,month,mode,coverage,cud,declared,complete,performed,sessions_paid)
  select md5('${run}:period:'||i)::uuid,'${owner}','${patient}','Paciente económico ficticio','${month}'::date-make_interval(months=>i),'Particular','','No informado',true,true,1,1 from generate_series(1,60)i;
  insert into public.settlements(id,professional_id,month)
  select md5('${run}:settlement:'||i)::uuid,'${owner}','${month}'::date-make_interval(months=>i) from generate_series(1,60)i;
  insert into public.collections(professional_id,period_id,date,contribution_cents,settlement_id,patient_name,mode,coverage,discipline,sessions_paid)
  select '${owner}',md5('${run}:period:'||i)::uuid,'${month}'::date-make_interval(months=>i),12345,md5('${run}:settlement:'||i)::uuid,'Paciente económico ficticio','Particular','','Prueba',1 from generate_series(1,60)i;
  insert into public.attachments(id,owner_id,purpose,settlement_id,bucket,path,name,size,mime_type,state,sha256,validated_at)
  select md5('${run}:attachment:'||i)::uuid,'${owner}','receipt',md5('${run}:settlement:'||i)::uuid,'receipts','${owner}/fixture-${run}-'||i,'Metadato sintético.png',68,'image/png','validated',repeat('0',64),now() from generate_series(1,60)i;
  insert into public.transfers(id,settlement_id,date,amount_cents,state,receipt_id,verified_by,verified_at)
  select md5('${run}:transfer:'||i)::uuid,md5('${run}:settlement:'||i)::uuid,'${month}'::date-make_interval(months=>i),12345,'verified',md5('${run}:attachment:'||i)::uuid,'${partner}',now() from generate_series(1,60)i;
  update public.attachments a set transfer_id=t.id from public.transfers t where t.receipt_id=a.id and a.path like '${owner}/fixture-${run}-%';
  update hamacar.finance_revision set revision=revision+1 where id=true;
  commit;`);
}
