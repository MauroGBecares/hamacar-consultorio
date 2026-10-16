import { Row } from '@core/data-access/backend';
import { Note } from '@shared/models/audit-entry';
import { LocalAttachment } from '@shared/models/attachment';
import { Collection, ServicePeriod, Settlement, Transfer } from '../domain/settlement';
export const periodFromRow = (
  p: Row<'service_periods'> & { persisted?: boolean },
): ServicePeriod => ({
  id: p.id,
  professionalId: p.professional_id,
  patientId: p.patient_id,
  patientName: p.patient_name,
  month: p.month.slice(0, 7),
  mode: p.mode as ServicePeriod['mode'],
  coverage: p.coverage,
  cud: p.cud,
  declared: p.declared,
  complete: p.complete,
  noService: p.no_service,
  performed: p.performed,
  sessionsPaid: p.sessions_paid,
  notes: p.notes as unknown as Note[],
  version: p.version,
  persisted: p.persisted ?? true,
});
export const settlementFromRow = (s: Row<'settlements'>): Settlement => ({
  id: s.id,
  professionalId: s.professional_id,
  month: s.month.slice(0, 7),
  notes: s.notes as unknown as Note[],
  version: s.version,
  persisted: true,
});
export const collectionFromRow = (c: Row<'collections'>): Collection => ({
  id: c.id,
  professionalId: c.professional_id,
  periodId: c.period_id,
  date: c.date,
  receivedCents: c.received_cents,
  contributionCents: c.contribution_cents,
  settlementId: c.settlement_id,
  patientName: c.patient_name,
  mode: c.mode as Collection['mode'],
  coverage: c.coverage,
  discipline: c.discipline,
  sessionsPaid: c.sessions_paid,
  version: c.version,
  cancelled: c.cancelled,
});
export type TransferRow = Row<'transfers'> & {
  verified_by_name?: string;
  receipt: Pick<LocalAttachment, 'id' | 'name' | 'size' | 'type'>;
};
export const transferFromRow = (t: TransferRow): Transfer => ({
  id: t.id,
  settlementId: t.settlement_id,
  date: t.date,
  amountCents: t.amount_cents,
  state: t.state as Transfer['state'],
  receipt: { ...t.receipt, url: '', lastModified: 0, persisted: true },
  notes: t.notes as unknown as Note[],
  verifiedBy: t.verified_by_name,
  verifiedAt: t.verified_at ?? undefined,
  replacesId: t.replaces_id ?? undefined,
  version: t.version,
});
