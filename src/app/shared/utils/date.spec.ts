import { addDays, dueDate, shiftMonth, validDate, weekStart } from './date';
import { parseMoney } from './money';

describe('Fechas civiles y montos', () => {
  it('navega entre meses sin desbordar febrero bisiesto', () => {
    expect(shiftMonth('2024-01-31', 1)).toBe('2024-02-29');
    expect(shiftMonth('2025-01-31', 1)).toBe('2025-02-28');
    expect(shiftMonth('2026-12-31', 1)).toBe('2027-01-31');
  });
  it('calcula vencimiento el 5 del siguiente mes y semanas desde lunes', () => {
    expect(dueDate('2026-12')).toBe('2027-01-05');
    expect(weekStart('2026-09-27')).toBe('2026-09-21');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });
  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '', '25/09/2026'])(
    'rechaza fecha inválida %s',
    (date) => expect(validDate(date)).toBe(false),
  );
  it('convierte importes decimales a enteros sin redondeo flotante', () => {
    expect(parseMoney('25000,50')).toBe(2500050);
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney('1,1')).toBe(110);
  });
  it.each(['0', '-1', '1.000,50', '12.333', '1e5', 'Infinity', '9007199254740992'])(
    'rechaza monto inválido %s',
    (value) => expect(() => parseMoney(value)).toThrow(),
  );
});
