import {
  Collection,
  FinanceState,
  ServicePeriod,
  Settlement,
  SettlementStatus,
  Transfer,
} from './settlement';

export const paymentLabels = {
  verified: 'Confirmado',
  informed: 'Pendiente de revisión',
  observed: 'Para corregir',
  replaced: 'Reemplazado',
} as const;
export const concepts = (state: FinanceState, settlementId: string): Collection[] =>
  state.collections.filter((c) => c.settlementId === settlementId && !c.cancelled);
export const transfers = (state: FinanceState, settlementId: string): Transfer[] =>
  state.transfers.filter((p) => p.settlementId === settlementId);
export const total = (state: FinanceState, settlementId: string): number =>
  concepts(state, settlementId).reduce((sum, c) => sum + c.contributionCents, 0);
export const paid = (state: FinanceState, settlementId: string): number =>
  transfers(state, settlementId)
    .filter((p) => p.state === 'verified')
    .reduce((sum, p) => sum + p.amountCents, 0);
export const reported = (state: FinanceState, settlementId: string): number =>
  transfers(state, settlementId)
    .filter((p) => p.state === 'informed')
    .reduce((sum, p) => sum + p.amountCents, 0);
/** Confirmado expresa recepción de una transferencia, NO cobertura de una deuda.
 * Ajuste vigente del 27/09: no se deriva un saldo exigible del importe cargado. */
export function settlementStatus(state: FinanceState, settlement: Settlement): SettlementStatus {
  const payments = transfers(state, settlement.id).filter((p) => p.state !== 'replaced');
  if (payments.some((p) => p.state === 'observed')) return 'Para corregir';
  if (payments.some((p) => p.state === 'informed')) return 'Pendiente de revisión';
  if (payments.some((p) => p.state === 'verified')) return 'Confirmado';
  return concepts(state, settlement.id).length ? 'Borrador' : 'Sin cargar';
}
export function periodStatus(state: FinanceState, period: ServicePeriod): string {
  if (period.noService) return 'Sin prestación';
  if (!period.declared) return 'Sin cargar';
  const collections = state.collections.filter((c) => c.periodId === period.id && !c.cancelled);
  if (!collections.length) return 'Pendiente de cobro';
  if (!period.complete) return 'Cobro parcial';
  if (collections.some((c) => !c.settlementId)) return 'Pendiente de liquidar';
  const statuses = collections
    .map((c) => state.settlements.find((s) => s.id === c.settlementId))
    .filter((s): s is Settlement => !!s)
    .map((s) => settlementStatus(state, s));
  if (statuses.length && statuses.every((s) => s === 'Confirmado')) return 'Confirmado';
  if (statuses.includes('Para corregir')) return 'Para corregir';
  if (statuses.includes('Pendiente de revisión')) return 'Pendiente de revisión';
  return 'Liquidado';
}
export function validateConceptSelection(
  state: FinanceState,
  settlement: Settlement,
  ids: readonly string[],
): Collection[] {
  if (new Set(ids).size !== ids.length) throw new Error('Un cobro no puede incluirse dos veces.');
  if (transfers(state, settlement.id).length)
    throw new Error('Los conceptos están congelados porque ya hay transferencias.');
  const selected = ids.map((id) => state.collections.find((c) => c.id === id));
  if (
    selected.some(
      (c) =>
        !c ||
        c.cancelled ||
        c.professionalId !== settlement.professionalId ||
        c.settlementId ||
        c.date.slice(0, 7) > settlement.month,
    )
  )
    throw new Error(
      'Algún concepto ya está incluido, es ajeno o pertenece a un cobro posterior al ciclo.',
    );
  if (!selected.length && !concepts(state, settlement.id).length)
    throw new Error('Seleccioná al menos un cobro.');
  return selected as Collection[];
}
