import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const url = 'https://imuawsrkrrhzhaxyfmcy.supabase.co';
const publishable = 'sb_publishable_lf5gdRhdyPu5d9sdgkPb5g_IH8jPOrb';
const service = process.env.HAMACAR_TEST_SERVICE_KEY,
  token = process.env.HAMACAR_TEST_MANAGEMENT_TOKEN;
if (!service || !token) throw new Error('Ejecutar con supabase-admin.ps1 -Action test.');
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const admin = createClient(url, service, options),
  visitor = createClient(url, publishable, options);
const run = randomUUID(),
  manifest = { run, users: [], patients: [], files: [], checks: [], cleaned: false };
mkdirSync('.tools', { recursive: true });
mkdirSync('docs/evidence', { recursive: true });
const save = () =>
  writeFileSync(`.tools/integration-${run}.json`, JSON.stringify(manifest, null, 2));
const pass = (label) => {
  manifest.checks.push(label);
  save();
  console.log('PASS: ' + label);
};
const sql = async (query) => {
  const response = await fetch(
    'https://api.supabase.com/v1/projects/imuawsrkrrhzhaxyfmcy/database/query',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error('SQL de prueba: ' + String(result.message).slice(0, 500));
  return result;
};
const ok = async (request, label) => {
  const r = await request;
  if (r.error) throw new Error(`${label}: ${r.error.code ?? ''} ${r.error.message}`);
  return r.data;
};
const denied = async (request, label, code) => {
  const r = await request;
  assert.ok(r.error, label);
  if (code) assert.equal(r.error.code, code, label);
};
const command = (client, area, action, input, operation = randomUUID()) =>
  client.rpc(area + '_command', { p_action: action, p_input: input, p_operation: operation });
const row = (client, table, id) =>
  ok(client.from(table).select('*').eq('id', id).single(), `Leer ${table}`);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(
  new Date(),
);
const plus = (date, days) =>
  new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const patientData = (name) => ({
  name,
  birthDate: '2010-01-01',
  admission: '2020-01-01',
  school: '',
  insurance: 'Cobertura ficticia',
  cud: 'No informado',
  diagnosis: '',
  reason: '',
  family: '',
  relation: '',
  contact: '',
  referral: '',
  reentry: 'No',
});
function png() {
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, data) => {
    const type = Buffer.from(name),
      out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    type.copy(out, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([type, data])), out.length - 4);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(1, 0);
  head.writeUInt32BE(1, 4);
  head[8] = 8;
  head[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(Buffer.from([0, 64, 160, 120, 255]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
async function upload(client, target, bytes = png(), name = 'archivo-ficticio.png') {
  const metadata = await ok(
    client.rpc('upload_reserve', {
      p_input: { ...target, name, size: bytes.length, type: 'image/png' },
      p_operation: randomUUID(),
    }),
    'Reservar adjunto',
  );
  manifest.files.push(metadata);
  save();
  await ok(
    client.storage
      .from(metadata.bucket)
      .upload(metadata.path, bytes, { contentType: 'image/png', upsert: false, cacheControl: '0' }),
    'Subir adjunto',
  );
  const validated = await ok(
    client.functions.invoke('finalize-upload', { body: { id: metadata.id } }),
    'Validar bytes',
  );
  if (validated.error) throw new Error(validated.error);
  return { ...metadata, ...validated };
}
const accounts = [];
try {
  for (let i = 0; i < 4; i++) {
    const email = `hamacar-test-${run}-${i}@example.com`,
      password = randomBytes(24).toString('base64url') + '!9aA';
    const data = await ok(
      admin.auth.admin.createUser({ email, password, email_confirm: true }),
      'Crear cuenta temporal sin correo',
    );
    manifest.users.push(data.user.id);
    save();
    const client = createClient(url, publishable, options);
    accounts.push({ id: data.user.id, email, password, client });
    await ok(client.auth.signInWithPassword({ email, password }), 'Ingresar cuenta temporal');
    await denied(client.rpc('session_open'), 'Perfil nuevo inactivo', '28000');
  }
  const ids = accounts.map((a) => `'${a.id}'`).join(',');
  await sql(
    `update public.profiles set full_name='Hamacar prueba '||right(id::text,6),discipline='Disciplina ficticia',active=true,role=case when id in ('${accounts[2].id}','${accounts[3].id}') then 'partner' else 'professional' end where id in (${ids});`,
  );
  for (const a of accounts) await ok(a.client.rpc('session_open'), 'Abrir sesión de aplicación');
  const [a, b, c, d] = accounts,
    [p1, p2, s1, s2] = accounts.map((a) => a.client);
  await denied(
    visitor.auth.signUp({ email: `hamacar-no-signup-${run}@example.com`, password: a.password }),
    'Registro público bloqueado',
  );
  await denied(
    p1.from('profiles').update({ role: 'partner' }).eq('id', a.id),
    'Cambio de rol desde app',
  );
  pass(
    'Auth real, perfiles inicialmente inactivos, registro público y edición de roles bloqueados',
  );
  const createPatient = async (client, name) => {
    const p = await ok(
      command(client, 'patient', 'save', { data: patientData(name), version: 1 }),
      'Crear paciente',
    );
    manifest.patients.push(p.id);
    save();
    return p;
  };
  const patient = await createPatient(p1, `Paciente ficticio A ${run}`),
    other = await createPatient(p2, `Paciente ficticio B ${run}`);
  assert.equal((await ok(p1.from('patients').select('id'), 'RLS pacientes')).length, 1);
  assert.equal((await ok(p2.from('patients').select('id'), 'RLS pacientes pares'))[0].id, other.id);
  await denied(visitor.from('patients').select('id'), 'Lectura visitante bloqueada', '42501');
  await denied(
    p1.from('patients').update({ name: 'Bypass' }).eq('id', patient.id),
    'Escritura directa de pacientes',
  );
  const duplicate = await ok(
    p2.rpc('patient_duplicates', { p_name: patientData(`Paciente ficticio A ${run}`).name }),
    'Coincidencia privada',
  );
  assert.deepEqual(duplicate, [{ accessible: false }]);
  const draft = {
      patientId: patient.id,
      visibility: 'private',
      date: today,
      text: 'Texto ficticio A',
      files: [],
      version: 0,
    },
    op = randomUUID();
  const first = await ok(command(p1, 'clinical', 'draft', draft, op), 'Guardar borrador');
  assert.deepEqual(
    await ok(command(p1, 'clinical', 'draft', draft, op), 'Repetir borrador'),
    first,
  );
  await denied(command(p1, 'clinical', 'draft', draft), 'Versión de borrador obsoleta', 'PT409');
  const published = await ok(
    command(p1, 'clinical', 'publish', { ...draft, version: first.version }),
    'Publicar registro',
  );
  assert.equal((await ok(p1.from('clinical_drafts').select('id'), 'Borrador eliminado')).length, 0);
  for (const client of [p2, s1, s2])
    assert.equal(
      (await ok(client.from('clinical_records').select('id'), 'Privacidad clínica')).length,
      0,
    );
  for (const client of [s1, s2]) {
    await ok(
      command(client, 'clinical', 'publish', {
        ...draft,
        text: 'Nota privada ficticia de socia',
        version: 0,
      }),
      'Nota propia de socia',
    );
    assert.equal(
      (await ok(client.from('clinical_records').select('id'), 'Privacidad entre socias')).length,
      1,
    );
  }
  await ok(
    command(p1, 'clinical', 'publish', {
      ...draft,
      text: 'Rectificación ficticia',
      version: 0,
      correctsRecordId: published.id,
      correctionReason: 'Corrección de prueba',
    }),
    'Rectificar',
  );
  assert.equal(
    (await ok(p1.from('clinical_records').select('id'), 'Original conservado')).length,
    2,
  );
  pass(
    'RLS de pacientes y notas entre dos profesionales y dos socias; borradores versionados, idempotencia y rectificación',
  );
  const clinicalFile = await upload(p1, {
    purpose: 'clinical',
    patientId: patient.id,
    visibility: 'private',
  });
  await ok(
    p1.functions.invoke('finalize-upload', { body: { id: clinicalFile.id } }),
    'Finalizar dos veces',
  );
  await denied(
    p1.storage
      .from(clinicalFile.bucket)
      .upload(clinicalFile.path, png(), { upsert: true, contentType: 'image/png' }),
    'Sustitución de objeto bloqueada',
  );
  await denied(
    p2.functions.invoke('download-file', { body: { id: clinicalFile.id } }),
    'Descarga ajena bloqueada',
  );
  await denied(
    s1.functions.invoke('download-file', { body: { id: clinicalFile.id } }),
    'Socia no descarga nota privada ajena',
  );
  await ok(
    command(p1, 'clinical', 'publish', {
      ...draft,
      version: 0,
      text: 'Informe ficticio',
      files: [clinicalFile.id],
    }),
    'Asociar informe validado',
  );
  await ok(
    p1.functions.invoke('download-file', { body: { id: clinicalFile.id } }),
    'Descarga propia',
  );
  const bad = await ok(
    p1.rpc('upload_reserve', {
      p_input: {
        purpose: 'clinical',
        patientId: patient.id,
        visibility: 'private',
        name: 'falso.png',
        size: 20,
        type: 'image/png',
      },
      p_operation: randomUUID(),
    }),
    'Reservar archivo inválido',
  );
  manifest.files.push(bad);
  save();
  await ok(
    p1.storage.from(bad.bucket).upload(bad.path, Buffer.alloc(20), { contentType: 'image/png' }),
    'Subir bytes falsos',
  );
  await denied(
    p1.functions.invoke('finalize-upload', { body: { id: bad.id } }),
    'Formato falso rechazado',
  );
  pass(
    'Storage privado, validación real de PNG, finalización repetida, descargas y sustituciones no autorizadas',
  );
  const start = plus(today, 7),
    booking = {
      data: {
        professionalId: a.id,
        patientId: patient.id,
        room: 1,
        start,
        from: '09:00',
        to: '10:00',
        every: 7,
        until: '',
      },
    };
  const competing = await Promise.all([
    command(p1, 'agenda', 'new', booking),
    command(p1, 'agenda', 'new', booking),
  ]);
  assert.equal(competing.filter((x) => !x.error).length, 1);
  assert.equal(competing.find((x) => x.error).error.code, '23P01');
  const series = competing.find((x) => !x.error).data;
  await ok(
    command(p1, 'agenda', 'new', { data: { ...booking.data, from: '10:00', to: '11:00' } }),
    'Intervalo adyacente',
  );
  await denied(
    command(p1, 'agenda', 'new', { data: { ...booking.data, start: plus(start, 1400) } }),
    'Conflicto de recurrencia indefinida',
    '23P01',
  );
  await denied(
    command(p1, 'agenda', 'new', { data: { ...booking.data, start: plus(today, -1) } }),
    'Reserva en el pasado bloqueada',
  );
  let event = (await ok(p1.rpc('agenda_read', { p_from: start, p_to: start }), 'Leer agenda')).find(
    (e) => e.id === series.id,
  );
  const movedOriginal = plus(start, 14),
    movedDate = plus(start, 3);
  await ok(
    command(p1, 'agenda', 'one', {
      id: series.id,
      version: event.version,
      original: movedOriginal,
      data: { ...booking.data, start: movedDate, from: '12:00', to: '13:00' },
    }),
    'Adelantar excepción',
  );
  event = (
    await ok(
      p1.rpc('agenda_read', { p_from: plus(start, 7), p_to: plus(start, 7) }),
      'Leer siguiente',
    )
  ).find((e) => e.id === series.id);
  await ok(
    command(p1, 'agenda', 'cancel-future', {
      id: series.id,
      version: event.version,
      original: plus(start, 7),
    }),
    'Finalizar serie',
  );
  assert.ok(
    (
      await ok(
        p1.rpc('agenda_read', { p_from: movedDate, p_to: movedDate }),
        'Conservar adelantado',
      )
    ).some((e) => e.id === series.id && e.original === movedOriginal),
  );
  const managed = await ok(
    command(s1, 'patient', 'manage', {
      id: patient.id,
      version: 1,
      professionalIds: [b.id],
      status: 'Archivado',
      reason: 'Archivo ficticio',
    }),
    'Desasignar y archivar',
  );
  const archived = await row(s1, 'patients', patient.id);
  await ok(
    command(s1, 'patient', 'manage', {
      id: patient.id,
      version: managed.version,
      professionalIds: [b.id, c.id],
      status: 'Archivado',
      reason: 'Solo equipo',
    }),
    'Cambiar equipo archivado',
  );
  const stillArchived = await row(s1, 'patients', patient.id);
  assert.equal(archived.closed_at, stillArchived.closed_at);
  assert.equal(archived.close_reason, stillArchived.close_reason);
  event = (
    await ok(p1.rpc('agenda_read', { p_from: start, p_to: start }), 'Agenda tras desasignación')
  ).find((e) => e.id === series.id);
  assert.equal(event.patientId, null);
  assert.equal(event.patientName, null);
  assert.equal(event.editable, false);
  await denied(
    command(p1, 'agenda', 'cancel-one', { id: series.id, version: event.version, original: start }),
    'Desasignada no cancela',
    '42501',
  );
  await ok(
    command(s1, 'agenda', 'cancel-one', { id: series.id, version: event.version, original: start }),
    'Socia cancela sin reactivar',
  );
  assert.equal(
    (await ok(p1.from('clinical_records').select('id'), 'Clínica tras desasignar')).length,
    0,
  );
  await denied(
    p1.functions.invoke('download-file', { body: { id: clinicalFile.id } }),
    'Archivo tras desasignar',
  );
  pass(
    'Agenda concurrente, intervalos adyacentes, recurrencia indefinida, excepciones conservadas, archivo y reglas D3/D4',
  );
  const financePatient = await createPatient(p1, `Paciente económico ficticio ${run}`),
    month = today.slice(0, 7) + '-01';
  const collectionInput = {
    patientId: financePatient.id,
    month,
    version: 1,
    mode: 'Particular',
    date: today,
    performed: 100,
    sessionsPaid: 2,
    contributionCents: 12000,
    receivedCents: null,
    complete: false,
  };
  const collectionOperation = randomUUID();
  const period = await ok(
    command(p1, 'finance', 'collection', collectionInput, collectionOperation),
    'Crear primer cobro',
  );
  assert.deepEqual(
    await ok(
      command(p1, 'finance', 'collection', collectionInput, collectionOperation),
      'Repetir cobro',
    ),
    period,
  );
  let collection = (
    await ok(p1.from('collections').select('*').eq('period_id', period.id), 'Leer cobro')
  )[0];
  await ok(
    command(p1, 'finance', 'correct', {
      id: collection.id,
      version: collection.version,
      date: today,
      performed: 100,
      sessionsPaid: 3,
      contributionCents: 15000,
      receivedCents: null,
      complete: false,
      reason: 'Corrección ficticia',
    }),
    'Corregir cobro propio',
  );
  assert.equal((await row(p1, 'service_periods', period.id)).sessions_paid, 3);
  const settlement = await ok(
    command(p1, 'finance', 'settlement-create', { month, version: 1 }),
    'Crear liquidación',
  );
  const pendingHistory = await ok(
    p1.rpc('finance_page', {
      p_query: { entity: 'collections', scope: { kind: 'settlements', ids: [settlement.id] } },
    }),
    'Conceptos pendientes desde una liquidación del historial',
  );
  assert.ok(pendingHistory.items.some((item) => item.id === collection.id));
  await denied(
    command(p1, 'finance', 'transfer', {
      id: settlement.id,
      version: settlement.version,
      date: today,
      amountCents: 1,
    }),
    'D1 sin conceptos',
  );
  const prepared = await ok(
    command(p1, 'finance', 'prepare', {
      id: settlement.id,
      version: settlement.version,
      collectionIds: [collection.id],
    }),
    'Incluir concepto',
  );
  const receipt = await upload(p1, { purpose: 'receipt', settlementId: settlement.id });
  collection = await row(p1, 'collections', collection.id);
  const race = await Promise.all([
    command(p1, 'finance', 'transfer', {
      id: settlement.id,
      version: prepared.version,
      date: today,
      amountCents: 987,
      receiptId: receipt.id,
    }),
    command(p1, 'finance', 'detach', {
      id: collection.id,
      version: collection.version,
      reason: 'Retiro concurrente de prueba',
    }),
  ]);
  assert.equal(race.filter((r) => !r.error).length, 1);
  let payments = await ok(
    p1.from('transfers').select('*').eq('settlement_id', settlement.id),
    'Transferencias de prueba',
  );
  if (!payments.length) {
    const s = await row(p1, 'settlements', settlement.id);
    const included = await ok(
      command(p1, 'finance', 'prepare', {
        id: s.id,
        version: s.version,
        collectionIds: [collection.id],
      }),
      'Volver a incluir',
    );
    await ok(
      command(p1, 'finance', 'transfer', {
        id: s.id,
        version: included.version,
        date: today,
        amountCents: 987,
        receiptId: receipt.id,
      }),
      'Transferencia de monto libre',
    );
    payments = await ok(
      p1.from('transfers').select('*').eq('settlement_id', settlement.id),
      'Leer transferencia',
    );
  }
  collection = await row(p1, 'collections', collection.id);
  await denied(
    command(p1, 'finance', 'annul', {
      id: collection.id,
      version: collection.version,
      reason: 'Intento sobre congelado',
    }),
    'Concepto congelado',
  );
  const payment = payments[0];
  const reviews = await Promise.all([
    command(s1, 'finance', 'verify', { id: payment.id, version: payment.version }),
    command(s2, 'finance', 'observe', {
      id: payment.id,
      version: payment.version,
      reason: 'Observación ficticia',
    }),
  ]);
  assert.equal(reviews.filter((r) => !r.error).length, 1);
  assert.equal(reviews.find((r) => r.error).error.code, 'PT409');
  let reviewed = await row(p1, 'transfers', payment.id);
  if (reviewed.state === 'observed') {
    const replacement = await upload(p1, { purpose: 'receipt', settlementId: settlement.id }),
      s = await row(p1, 'settlements', settlement.id);
    await ok(
      command(p1, 'finance', 'transfer', {
        id: s.id,
        version: s.version,
        date: today,
        amountCents: 988,
        receiptId: replacement.id,
        replacesId: reviewed.id,
        replacesVersion: reviewed.version,
      }),
      'Reemplazar observada',
    );
    assert.equal((await row(p1, 'transfers', reviewed.id)).state, 'replaced');
    reviewed = (
      await ok(p1.from('transfers').select('*').eq('replaces_id', reviewed.id), 'Leer reemplazo')
    )[0];
    await ok(
      command(s1, 'finance', 'verify', { id: reviewed.id, version: reviewed.version }),
      'Confirmar reemplazo',
    );
  }
  await denied(
    command(s2, 'finance', 'observe', { id: reviewed.id, version: 99, reason: 'No corresponde' }),
    'Verificada inmutable',
    'PT409',
  );
  const noServicePatient = await createPatient(p1, `Sin prestación ficticia ${run}`);
  const noService = await ok(
    command(p1, 'finance', 'no-service', { patientId: noServicePatient.id, month, version: 1 }),
    'Declarar sin prestación',
  );
  const reopened = await ok(
    command(p1, 'finance', 'reopen', {
      id: noService.id,
      version: noService.version,
      reason: 'Declaración accidental ficticia',
    }),
    'Reabrir sin prestación',
  );
  await ok(
    command(p1, 'finance', 'collection', {
      ...collectionInput,
      id: noService.id,
      patientId: noServicePatient.id,
      version: reopened.version,
    }),
    'Cobrar después de reabrir',
  );
  const firstModePatient = await createPatient(p1, `Primera modalidad ficticia ${run}`);
  const firstModeRace = await Promise.all([
    command(p1, 'finance', 'collection', { ...collectionInput, patientId: firstModePatient.id }),
    command(p1, 'finance', 'collection', {
      ...collectionInput,
      patientId: firstModePatient.id,
      mode: 'Cobertura',
      receivedCents: 20000,
    }),
  ]);
  assert.equal(firstModeRace.filter((r) => !r.error).length, 1);
  assert.equal(firstModeRace.find((r) => r.error).error.code, 'PT409');
  pass('Primer cobro repetido y modalidad concurrente sin duplicación ni mezcla');
  pass(
    'D1/D2, corrección auditada, sesiones recalculadas, transferencia libre, retiro concurrente, revisión simultánea y reapertura',
  );
  const page = await ok(
    s1.rpc('finance_page', { p_query: { entity: 'collections', limit: 1 } }),
    'Página económica',
  );
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
  const previousRevision = page.revision;
  await ok(
    command(p1, 'finance', 'period-note', {
      id: period.id,
      version: (await row(p1, 'service_periods', period.id)).version,
      observation: 'Revisión ficticia',
    }),
    'Cambiar revisión',
  );
  await denied(
    s1.rpc('finance_page', { p_query: { entity: 'collections', revision: previousRevision } }),
    'Informe cambia de revisión',
    'PT409',
  );
  const summary = await ok(
    s1.rpc('finance_dashboard', { p_month: month }),
    'Indicadores completos',
  );
  assert.ok(summary.verifiedCents > 0);
  await sql(
    `update hamacar.app_sessions set last_activity=now()-interval '31 minutes' where user_id='${b.id}';`,
  );
  await denied(p2.rpc('session_activity'), 'Sesión vencida no revive', '28000');
  await denied(p2.rpc('session_open'), 'Reabrir token vencido bloqueado', '28000');
  assert.equal((await ok(p2.from('patients').select('id'), 'RLS tras vencimiento')).length, 0);
  await ok(
    p2.auth.signInWithPassword({ email: b.email, password: b.password }),
    'Nueva autenticación',
  );
  await ok(p2.rpc('session_open'), 'Nueva sesión tras inactividad');
  const changedPassword = randomBytes(24).toString('base64url') + '!9aA';
  await ok(p2.auth.updateUser({ password: changedPassword }), 'Cambio de contraseña autenticado');
  await ok(p2.auth.signOut(), 'Salir después de cambiar la contraseña');
  await ok(
    p2.auth.signInWithPassword({ email: b.email, password: changedPassword }),
    'Ingreso con contraseña cambiada',
  );
  await ok(p2.rpc('session_open'), 'Sesión con contraseña cambiada');
  const recoveredPassword = randomBytes(24).toString('base64url') + '!9aA';
  await ok(
    admin.auth.admin.updateUserById(b.id, { password: recoveredPassword }),
    'Recuperación administrativa sin correo',
  );
  await sql(
    `update hamacar.app_sessions set revoked_at=now() where user_id='${b.id}' and revoked_at is null;`,
  );
  await denied(p2.rpc('session_activity'), 'Recuperación revoca la sesión anterior', '28000');
  await ok(
    p2.auth.signInWithPassword({ email: b.email, password: recoveredPassword }),
    'Ingreso tras recuperación administrativa',
  );
  await ok(p2.rpc('session_open'), 'Nueva sesión después de recuperar contraseña');
  pass('Cambio de contraseña y recuperación administrativa sin SMTP, con revocación de sesiones');
  await sql(`update public.profiles set active=false where id='${b.id}';`);
  await denied(p2.rpc('session_open'), 'Baja inmediata', '28000');
  pass(
    'Paginación, revisión global de exportación, indicadores, expiración en servidor y baja de perfil',
  );
  await sql(
    `update public.attachments set created_at=now()-interval '25 hours' where id in ('${bad.id}','${clinicalFile.id}');`,
  );
  await denied(
    p1.functions.invoke('cleanup-uploads', { body: {} }),
    'Limpieza reservada a servidor',
  );
  const [{ token: cleanupToken }] = await sql(
    "select decrypted_secret as token from vault.decrypted_secrets where name='hamacar_cleanup_token'",
  );
  const cleaned = await ok(
    admin.functions.invoke('cleanup-uploads', {
      body: {},
      headers: { 'x-hamacar-cleanup-token': cleanupToken },
    }),
    'Ejecutar limpieza',
  );
  assert.equal(cleaned.failed, 0);
  assert.equal((await row(admin, 'attachments', bad.id)).state, 'deleted');
  assert.equal((await row(admin, 'attachments', clinicalFile.id)).state, 'validated');
  await denied(admin.storage.from(bad.bucket).download(bad.path), 'Objeto huérfano retirado');
  pass('Limpieza autenticada retira cargas abandonadas y conserva archivos referenciados');
  const { volumeFixture } = await import('./volume-fixture.mjs');
  await volumeFixture({ sql, owner: a.id, partner: c.id, patient: financePatient.id, month, run });
  const scope = await ok(
    s1.rpc('finance_scope', { p_query: { month } }),
    'Primera página histórica',
  );
  assert.equal(scope.ids.length, 50);
  assert.ok(scope.nextCursor);
  const scope2 = await ok(
    s1.rpc('finance_scope', { p_query: { month, cursor: scope.nextCursor } }),
    'Segunda página histórica',
  );
  assert.ok(scope2.ids.length >= 11);
  assert.ok(scope2.ids.every((id) => !scope.ids.includes(id)));
  const scoped = await ok(
    s1.rpc('finance_page', { p_query: { entity: 'settlements', scope, revision: scope.revision } }),
    'Lectura acotada histórica',
  );
  assert.equal(scoped.items.length, 50);
  await denied(
    command(p1, 'finance', 'collection', { ...collectionInput, contributionCents: 1.5 }),
    'Centavos fraccionarios',
  );
  await denied(
    p1.storage.from(clinicalFile.bucket).createSignedUrl(clinicalFile.path, 3600),
    'URL firmada bloqueada',
  );
  pass(
    'Historial con más de 50 liquidaciones, cursores sin duplicados, consultas acotadas e importes enteros',
  );
  if (process.env.HAMACAR_BROWSER_TEST === '1') {
    const { browserChecks } = await import('./browser-checks.mjs');
    await browserChecks({ accounts, patientId: financePatient.id, run, pass, sql, png });
  }
} catch (error) {
  manifest.failure = error.message;
  process.exitCode = 1;
  console.error('FAIL: ' + error.message);
} finally {
  try {
    if (manifest.users.length) {
      const allFiles = await ok(
        admin.from('attachments').select('bucket,path').in('owner_id', manifest.users),
        'Buscar objetos de la ejecución',
      );
      manifest.files = [
        ...new Map(
          [...manifest.files, ...allFiles].map((f) => [f.bucket + '/' + f.path, f]),
        ).values(),
      ];
      save();
    }
    for (const f of manifest.files)
      await ok(admin.storage.from(f.bucket).remove([f.path]), 'Retirar archivo temporal');
    if (manifest.users.length) {
      const ids = manifest.users
        .map((id) => {
          assert.match(id, /^[a-f0-9-]{36}$/);
          return `'${id}'`;
        })
        .join(',');
      await sql(`begin;
    update public.attachments set transfer_id=null,record_id=null,draft_id=null where owner_id in (${ids});
    delete from public.transfers where settlement_id in(select id from public.settlements where professional_id in (${ids}));
    delete from public.attachments where owner_id in (${ids});
    delete from public.collections where professional_id in (${ids});
    delete from public.service_periods where professional_id in (${ids});
    delete from public.settlements where professional_id in (${ids});
    delete from public.clinical_records where author_id in (${ids});
    delete from public.clinical_drafts where author_id in (${ids});
    delete from public.booking_exceptions where series_id in(select id from public.booking_series where professional_id in (${ids}));
    delete from public.booking_series where professional_id in (${ids});
    delete from public.patient_team where patient_id in(select id from public.patients where created_by in (${ids}));
    delete from public.patients where created_by in (${ids});
    delete from public.audit_entries where actor_id in (${ids}) or owner_id in (${ids}) or (area='profiles' and entity_id in (${ids}));
    delete from hamacar.operations where user_id in (${ids});delete from hamacar.app_sessions where user_id in (${ids});
    delete from public.profiles where id in (${ids});update hamacar.finance_revision set revision=revision+1;
    commit;`);
      for (const id of manifest.users)
        await ok(admin.auth.admin.deleteUser(id), 'Retirar cuenta temporal');
    }
    manifest.cleaned = true;
    console.log('CLEANUP: cuentas, datos y objetos de esta ejecución retirados.');
  } catch (error) {
    manifest.cleanupFailure = error.message;
    process.exitCode = 1;
    console.error('CLEANUP PENDIENTE: ' + error.message);
  }
  save();
  writeFileSync(
    'docs/evidence/integration-latest.json',
    JSON.stringify(
      {
        run,
        date: new Date().toISOString(),
        checks: manifest.checks,
        failure: manifest.failure ?? null,
        cleaned: manifest.cleaned,
        cleanupFailure: manifest.cleanupFailure ?? null,
      },
      null,
      2,
    ),
  );
}
