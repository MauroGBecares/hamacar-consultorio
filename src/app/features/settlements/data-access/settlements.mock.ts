import { USERS, testUserId } from '@core/identity/users.mock';
import { FinanceState, ServicePeriod, Settlement, emptyFinance } from '../domain/settlement';

/** Mismos escenarios y montos del snapshot v13. Sin importar datos clínicos. */
export function seedSettlements(): FinanceState {
  const state = emptyFinance();
  const names = [
    'Mateo García',
    'Emma Rodríguez',
    'Benicio López',
    'Juana Fernández',
    'Santino Pérez',
  ];
  const coverage = ['OSDE', 'IAPOS', 'Swiss Medical', 'OSDE', 'IAPOS'];
  let sequence = 0;
  const id = (prefix: string) => `${prefix}${++sequence}`;
  const createPeriod = (
    professionalId: string,
    patientId: number,
    month: string,
    mode: 'Particular' | 'Cobertura',
  ): ServicePeriod => ({
    id: `period-${professionalId}-${patientId}-${month}`,
    professionalId,
    patientId: testUserId(patientId),
    patientName: names[patientId - 1],
    month,
    mode,
    coverage: coverage[patientId - 1],
    cud: [1, 3].includes(patientId) ? 'Sí' : patientId === 4 ? 'No' : 'No informado',
    declared: false,
    complete: false,
    noService: false,
    performed: 0,
    sessionsPaid: 0,
    notes: [],
    version: 1,
  });
  for (const user of USERS.filter((u) => u.role === 'professional')) {
    const number = Number(user.id.slice(-12));
    const firstPatient = ((number - 1) % 5) + 1;
    const secondPatient = (number % 5) + 1;
    for (let n = 4; n <= 9; n++) {
      const month = `2026-${String(n).padStart(2, '0')}`;
      const period = createPeriod(user.id, firstPatient, month, 'Particular');
      const settlement: Settlement = {
        id: `settlement-${user.id}-${month}`,
        professionalId: user.id,
        month,
        notes: [],
        version: 1,
      };
      state.periods.push(period);
      state.settlements.push(settlement);
      period.declared = !(n === 9 && number === 10);
      period.complete = !(n === 9 && [7, 10].includes(number));
      period.performed = 4;
      period.sessionsPaid = period.complete ? 4 : 0;
      if (period.complete) {
        const contributionCents = (24000 + number * 2500 + n * 700) * 100;
        state.collections.push({
          id: id('c'),
          version: 1,
          professionalId: user.id,
          periodId: period.id,
          date: `${month}-20`,
          receivedCents: null,
          contributionCents,
          settlementId: n === 9 && number === 8 ? null : settlement.id,
          patientName: period.patientName,
          mode: period.mode!,
          coverage: period.coverage,
          discipline: user.discipline,
          sessionsPaid: 4,
        });
        if (!(n === 9 && [4, 5, 8].includes(number)) && !(n === 8 && number === 5)) {
          const paymentState =
            n === 9 && number === 9
              ? 'informed'
              : n === 9 && number === 6
                ? 'observed'
                : 'verified';
          state.transfers.push({
            id: id('t'),
            version: 1,
            settlementId: settlement.id,
            date: `${month}-22`,
            amountCents: contributionCents,
            state: paymentState,
            receipt: {
              id: 'fixture',
              name: 'Comprobante de ejemplo',
              size: 1,
              type: 'image/png',
              url: '',
              lastModified: 0,
              persisted: true,
            },
            notes:
              paymentState === 'observed'
                ? [
                    {
                      text: 'La imagen no permite leer el importe. Adjuntá un comprobante legible.',
                      author: 'Antonela Bécares',
                      at: '2026-09-24T15:30:00Z',
                    },
                  ]
                : [],
            ...(paymentState === 'verified'
              ? { verifiedBy: 'Antonela Bécares', verifiedAt: `${month}-23T12:00:00Z` }
              : {}),
          });
        }
      }
    }
    for (let n = 6; n <= 9; n++) {
      const period = createPeriod(user.id, secondPatient, `2026-0${n}`, 'Cobertura');
      period.declared = n < 9;
      if (n === 7) {
        period.complete = true;
        state.collections.push({
          id: id('c'),
          version: 1,
          professionalId: user.id,
          periodId: period.id,
          date: '2026-09-18',
          receivedCents: (180000 + number * 5000) * 100,
          contributionCents: (18000 + number * 1000) * 100,
          settlementId: null,
          patientName: period.patientName,
          mode: period.mode!,
          coverage: period.coverage,
          discipline: user.discipline,
          sessionsPaid: 0,
        });
      }
      if (n === 8)
        period.notes.push({
          text: 'Presentación realizada. La cobertura todavía no abonó.',
          author: user.fullName,
          at: '2026-09-20T12:00:00Z',
        });
      state.periods.push(period);
    }
  }
  return state;
}
