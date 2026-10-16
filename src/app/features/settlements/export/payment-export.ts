import { User } from '@core/identity/user';
import { validDate, validMonth } from '@shared/utils/date';
import { FinanceState, PaymentState, Transfer } from '../domain/settlement';
import { paymentLabels } from '../domain/settlement-rules';
import { buildXlsx, excelDate, XlsxSheet, xlsxCell as cell } from './xlsx-writer';

export interface ExportFilters {
  all: boolean;
  professionalId: string;
  month: string;
  from: string;
  to: string;
  state: PaymentState | '';
}
export function selectTransfers(state: FinanceState, filters: ExportFilters): Transfer[] {
  if (
    !filters.all &&
    ((filters.from && !validDate(filters.from)) ||
      (filters.to && !validDate(filters.to)) ||
      (filters.month && !validMonth(filters.month)))
  )
    throw new Error('Revisá las fechas de exportación.');
  if (!filters.all && filters.from && filters.to && filters.from > filters.to)
    throw new Error('La fecha desde debe ser anterior o igual a la fecha hasta.');
  return state.transfers
    .filter((transfer) => {
      const settlement = state.settlements.find((s) => s.id === transfer.settlementId);
      return (
        !!settlement &&
        (filters.all ||
          ((!filters.professionalId || settlement.professionalId === filters.professionalId) &&
            (!filters.month || settlement.month === filters.month) &&
            (!filters.from || transfer.date >= filters.from) &&
            (!filters.to || transfer.date <= filters.to) &&
            (!filters.state || transfer.state === filters.state)))
      );
    })
    .toSorted((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
export function exportSheets(
  state: FinanceState,
  users: readonly User[],
  filters: ExportFilters,
): XlsxSheet[] {
  const selected = selectTransfers(state, filters);
  const ids = new Set(selected.map((p) => p.settlementId));
  const userName = (id: string) => users.find((user) => user.id === id)?.fullName ?? '';
  return [
    {
      name: 'Transferencias',
      title: 'Hamacar · Historial de pagos',
      note: 'Una fila por transferencia. Solo Confirmado cuenta como ingreso. Datos de Supabase.',
      headers: [
        'ID pago',
        'ID liquidación',
        'Profesional',
        'Mes de liquidación',
        'Fecha de transferencia',
        'Monto transferido (ARS)',
        'Estado',
        'Comprobante (nombre)',
        'Observaciones del pago',
        'Confirmado por',
        'Fecha de confirmación',
        'Observaciones de liquidación',
      ],
      widths: [38, 36, 28, 20, 22, 24, 24, 30, 48, 28, 22, 48],
      rows: selected.map((payment) => {
        const settlement = state.settlements.find((s) => s.id === payment.settlementId)!;
        return [
          cell(payment.id),
          cell(settlement.id),
          cell(userName(settlement.professionalId)),
          cell(excelDate(`${settlement.month}-01`), 4),
          cell(excelDate(payment.date), 3),
          cell(payment.amountCents / 100, 2),
          cell(paymentLabels[payment.state]),
          cell(payment.receipt.name),
          cell(payment.notes.map((n) => n.text).join(' | ')),
          cell(payment.state === 'verified' ? (payment.verifiedBy ?? '') : ''),
          payment.state === 'verified' && payment.verifiedAt
            ? cell(excelDate(payment.verifiedAt), 3)
            : cell(''),
          cell(settlement.notes.map((n) => n.text).join(' | ')),
        ];
      }),
    },
    {
      name: 'Detalle por paciente',
      title: 'Hamacar · Detalle por paciente',
      note: 'Un concepto por fila. Vincular por ID liquidación; no representa una distribución del dinero transferido.',
      headers: [
        'ID liquidación',
        'ID concepto',
        'Profesional',
        'Paciente',
        'Mes de prestación',
        'Fecha de cobro',
        'Modalidad / Cobertura',
        'Sesiones de este cobro',
        'Monto cobrado (ARS)',
        'Importe cargado para Hamacar (ARS)',
      ],
      widths: [36, 38, 28, 28, 22, 22, 28, 28, 24, 32],
      rows: state.collections
        .filter((c) => !c.cancelled && c.settlementId && ids.has(c.settlementId))
        .map((collection) => {
          const period = state.periods.find((p) => p.id === collection.periodId)!;
          return [
            cell(collection.settlementId!),
            cell(collection.id),
            cell(userName(collection.professionalId)),
            cell(collection.patientName),
            cell(excelDate(`${period.month}-01`), 4),
            cell(excelDate(collection.date), 3),
            cell(collection.mode === 'Particular' ? 'Particular' : collection.coverage),
            cell(collection.mode === 'Particular' ? collection.sessionsPaid : ''),
            collection.receivedCents === null ? cell('') : cell(collection.receivedCents / 100, 2),
            cell(collection.contributionCents / 100, 2),
          ];
        }),
    },
  ];
}
export function exportPayments(
  state: FinanceState,
  users: readonly User[],
  filters: ExportFilters,
): Blob {
  if (!selectTransfers(state, filters).length)
    throw new Error('No hay transferencias con estos filtros.');
  const context = filters.all
    ? 'Todo el historial · Datos ficticios'
    : `Mes: ${filters.month || 'todos'} · Desde ${filters.from || 'inicio'} hasta ${filters.to || 'última'} · ${filters.state ? paymentLabels[filters.state] : 'Todos los estados'} · ${users.find((u) => u.id === filters.professionalId)?.fullName ?? 'Todo el equipo'}`;
  return buildXlsx(exportSheets(state, users, filters), context);
}
