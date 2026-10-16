import { USERS, testUserId } from '@core/identity/users.mock';
import { seedSettlements } from '../data-access/settlements.mock';
import {
  paid,
  periodStatus,
  settlementStatus,
  total,
  validateConceptSelection,
} from './settlement-rules';

describe('Reglas económicas vigentes', () => {
  it('las socias no tienen períodos ni liquidaciones propias', () => {
    const state = seedSettlements();
    expect(
      state.settlements.every(
        (s) => USERS.find((u) => u.id === s.professionalId)?.role === 'professional',
      ),
    ).toBe(true);
    expect(
      state.periods.every(
        (p) => USERS.find((u) => u.id === p.professionalId)?.role === 'professional',
      ),
    ).toBe(true);
  });
  it('Sin cargar no se convierte en deuda y Sin prestación conserva su etiqueta hasta reabrirse', () => {
    const state = seedSettlements();
    const period = state.periods.find(
      (p) => p.professionalId === testUserId(10) && p.month === '2026-09',
    )!;
    expect(periodStatus(state, period)).toBe('Sin cargar');
    expect(periodStatus(state, { ...period, noService: true })).toBe('Sin prestación');
  });
  it('un pago confirmado expresa recepción, aunque difiera del aporte cargado', () => {
    const state = seedSettlements();
    const bill = state.settlements.find(
      (s) => s.professionalId === testUserId(4) && s.month === '2026-09',
    )!;
    state.transfers.push({
      id: 'partial',
      settlementId: bill.id,
      date: '2026-09-25',
      amountCents: 100,
      state: 'verified',
      receipt: {
        id: 'fixture',
        name: 'demo',
        size: 1,
        type: 'image/png',
        url: '',
        lastModified: 0,
        persisted: true,
      },
      notes: [],
      version: 1,
    });
    expect(paid(state, bill.id)).toBe(100);
    expect(total(state, bill.id)).toBeGreaterThan(100);
    expect(settlementStatus(state, bill)).toBe('Confirmado');
  });
  it('los intentos reemplazados no suman ingresos ni modifican el estado', () => {
    const state = seedSettlements();
    const bill = state.settlements[0];
    state.transfers = [
      {
        id: 'old',
        settlementId: bill.id,
        date: '2026-09-25',
        amountCents: 9999,
        state: 'replaced',
        receipt: {
          id: 'fixture',
          name: 'old',
          size: 1,
          type: 'image/png',
          url: '',
          lastModified: 0,
          persisted: true,
        },
        notes: [],
        version: 1,
      },
    ];
    expect(paid(state, bill.id)).toBe(0);
    expect(settlementStatus(state, bill)).toBe('Borrador');
  });
  it('rechaza conceptos duplicados, ajenos, incluidos y posteriores al ciclo', () => {
    const state = seedSettlements();
    const bill = state.settlements.find(
      (s) => s.professionalId === testUserId(4) && s.month === '2026-09',
    )!;
    const pending = state.collections.find(
      (c) => c.professionalId === testUserId(4) && !c.settlementId,
    )!;
    expect(() => validateConceptSelection(state, bill, [pending.id, pending.id])).toThrow();
    expect(() =>
      validateConceptSelection(state, bill, [
        state.collections.find((c) => c.professionalId === testUserId(5))!.id,
      ]),
    ).toThrow();
    expect(() =>
      validateConceptSelection(state, bill, [
        state.collections.find((c) => c.settlementId === bill.id)!.id,
      ]),
    ).toThrow();
    expect(() =>
      validateConceptSelection(state, { ...bill, month: '2026-08' }, [pending.id]),
    ).toThrow();
    expect(validateConceptSelection(state, bill, [pending.id])).toHaveLength(1);
  });
});
