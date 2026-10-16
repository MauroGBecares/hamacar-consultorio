import { BookingSeries } from './booking';
import {
  endBefore,
  eventsOn,
  proposalConflict,
  seriesConflict,
  validateBooking,
} from './recurrence';

const series = (patch: Partial<BookingSeries> = {}): BookingSeries => ({
  id: 'a',
  professionalId: '00000000-0000-4000-8000-000000000001',
  patientId: '00000000-0000-4000-8000-000000000001',
  room: 1,
  start: '2026-09-25',
  from: '09:00',
  to: '10:00',
  every: 7,
  until: '',
  exceptions: {},
  ...patch,
});
describe('Recurrencias de agenda', () => {
  it('detecta cruces semanales y quincenales, incluidos comienzos lejanos', () => {
    const a = series();
    expect(seriesConflict(a, series({ id: 'b', start: '2027-01-01', every: 14 }))?.date).toBe(
      '2027-01-01',
    );
  });
  it('admite quincenales alternadas y horarios contiguos', () => {
    expect(
      seriesConflict(series({ every: 14 }), series({ id: 'b', start: '2026-10-02', every: 14 })),
    ).toBeNull();
    expect(seriesConflict(series(), series({ id: 'b', from: '10:00', to: '11:00' }))).toBeNull();
  });
  it('distingue cruce de profesional y paciente aunque el consultorio sea otro', () => {
    expect(
      seriesConflict(
        series(),
        series({ id: 'b', room: 2, patientId: '00000000-0000-4000-8000-000000000002' }),
      )?.kind,
    ).toBe('profesional');
    expect(
      seriesConflict(
        series(),
        series({ id: 'b', room: 2, professionalId: '00000000-0000-4000-8000-000000000002' }),
      )?.kind,
    ).toBe('paciente');
  });
  it('no inventa cruces cuando los tres recursos difieren', () =>
    expect(
      seriesConflict(
        series(),
        series({
          id: 'b',
          room: 2,
          professionalId: '00000000-0000-4000-8000-000000000002',
          patientId: '00000000-0000-4000-8000-000000000002',
        }),
      ),
    ).toBeNull());
  it('considera cancelaciones y movimientos fuera del horizonte base', () => {
    const a = series({ every: 0, exceptions: { '2026-09-25': { cancelled: true } } });
    expect(seriesConflict(a, series())).toBeNull();
    const moved = series({
      every: 0,
      exceptions: {
        '2026-09-25': { cancelled: false, date: '2028-03-10', from: '14:00', to: '15:00', room: 3 },
      },
    });
    expect(
      seriesConflict(
        moved,
        series({ id: 'b', room: 3, start: '2028-03-10', from: '14:30', to: '15:30', every: 0 }),
      )?.date,
    ).toBe('2028-03-10');
  });
  it('detecta una excepción que cruza otra ocurrencia de su propia serie', () => {
    const a = series({
      exceptions: {
        '2026-09-25': { cancelled: false, date: '2026-10-02', from: '09:30', to: '10:30', room: 2 },
      },
    });
    expect(proposalConflict([a])?.kind).toBe('profesional');
  });
  it('finaliza las excepciones movidas al futuro y conserva el pasado', () => {
    const a = series({
      exceptions: {
        '2026-09-25': { cancelled: false, date: '2026-10-10', from: '09:00', to: '10:00', room: 1 },
      },
    });
    const ended = endBefore(a, '2026-10-05');
    expect(eventsOn(ended, '2026-10-02')).toHaveLength(1);
    expect(eventsOn(ended, '2026-10-10')).toHaveLength(0);
    expect(eventsOn(ended, '2026-10-09')).toHaveLength(0);
  });
  it('conserva encuentros adelantados aunque la fecha original quede fuera de la serie', () => {
    const a = series({
      until: '2026-10-01',
      exceptions: {
        '2026-10-02': { cancelled: false, date: '2026-09-30', from: '09:00', to: '10:00', room: 1 },
      },
    });
    expect(eventsOn(a, '2026-09-30')).toHaveLength(1);
  });
  it('rechaza fechas inválidas, intervalos inversos y frecuencias no soportadas', () => {
    expect(() => validateBooking(series({ start: '2026-02-30' }), '2026-01-01')).toThrow();
    expect(() => validateBooking(series({ from: '10:00', to: '09:00' }), '2026-01-01')).toThrow();
    expect(() => validateBooking(series({ every: 2 as 7 }), '2026-01-01')).toThrow();
  });
});
