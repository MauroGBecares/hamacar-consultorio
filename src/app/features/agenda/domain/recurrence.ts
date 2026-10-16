import { addDays, dayNumber, validDate } from '@shared/utils/date';
import { BookingInput, BookingSeries, Occurrence } from './booking';

export const minutes = (time: string): number => {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};
export const frequency = (interval: number): string =>
  interval === 14 ? 'Quincenal' : interval === 7 ? 'Semanal' : 'Única vez';
export function baseOn(series: BookingSeries, date: string): boolean {
  return (
    date >= series.start &&
    (!series.until || date <= series.until) &&
    (series.every === 0
      ? date === series.start
      : (dayNumber(date) - dayNumber(series.start)) % series.every === 0)
  );
}
export function eventsOn(series: BookingSeries, date: string): Occurrence[] {
  const list: Occurrence[] = [];
  if (baseOn(series, date) && !series.exceptions[date])
    list.push({ ...series, date, original: date, changed: false });
  for (const [original, exception] of Object.entries(series.exceptions)) {
    if (!exception.cancelled && exception.date === date)
      list.push({ ...series, ...exception, date, original, changed: true });
  }
  return list;
}
export interface BookingConflict {
  date: string;
  kind: 'consultorio' | 'profesional' | 'paciente';
  from: string;
  to: string;
}
function conflictBetween(a: Occurrence, b: Occurrence): BookingConflict | null {
  if (minutes(a.from) >= minutes(b.to) || minutes(b.from) >= minutes(a.to)) return null;
  const kind =
    a.room === b.room
      ? 'consultorio'
      : a.professionalId === b.professionalId
        ? 'profesional'
        : a.patientId === b.patientId
          ? 'paciente'
          : null;
  return kind ? { date: a.date, kind, from: b.from, to: b.to } : null;
}
/** Cada recurrencia es 0/7/14 días. Un ciclo de 14 días encuentra cualquier cruce
 * base; cada excepción puede ocultar uno. Se amplía el horizonte por su cantidad
 * y se evalúan además todas las fechas movidas, incluso fuera de ese horizonte. */
export function seriesConflict(a: BookingSeries, b: BookingSeries): BookingConflict | null {
  const dates = new Set<string>();
  const low = a.start > b.start ? a.start : b.start;
  const endA = a.every ? a.until || '9999-12-31' : a.start;
  const endB = b.every ? b.until || '9999-12-31' : b.start;
  const high = endA < endB ? endA : endB;
  const horizon = 14 * (Object.keys(a.exceptions).length + Object.keys(b.exceptions).length + 2);
  if (low <= high)
    for (let i = 0; i < horizon; i++) {
      const date = addDays(low, i);
      if (date > high) break;
      if (baseOn(a, date) && baseOn(b, date)) dates.add(date);
    }
  for (const series of [a, b])
    for (const [original, exception] of Object.entries(series.exceptions)) {
      if (!exception.cancelled) dates.add(exception.date);
    }
  for (const date of [...dates].sort())
    for (const x of eventsOn(a, date))
      for (const y of eventsOn(b, date)) {
        const conflict = conflictBetween(x, y);
        if (conflict) return conflict;
      }
  return null;
}
export function proposalConflict(series: readonly BookingSeries[]): BookingConflict | null {
  for (let i = 0; i < series.length; i++) {
    for (const exception of Object.values(series[i].exceptions)) {
      if (exception.cancelled) continue;
      const occurrences = eventsOn(series[i], exception.date);
      for (let x = 0; x < occurrences.length; x++)
        for (let y = x + 1; y < occurrences.length; y++) {
          const conflict = conflictBetween(occurrences[x], occurrences[y]);
          if (conflict) return conflict;
        }
    }
    for (let j = i + 1; j < series.length; j++) {
      const conflict = seriesConflict(series[i], series[j]);
      if (conflict) return conflict;
    }
  }
  return null;
}
export function validateBooking(data: BookingInput, today: string): void {
  if (![1, 2, 3].includes(data.room) || ![0, 7, 14].includes(data.every))
    throw new Error('Revisá consultorio y frecuencia.');
  if (!validDate(data.start) || data.start < today) throw new Error('Elegí una fecha desde hoy.');
  if (data.until && (!validDate(data.until) || data.until < data.start))
    throw new Error('La última fecha debe ser igual o posterior a la primera.');
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.from) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.to) ||
    minutes(data.from) >= minutes(data.to)
  )
    throw new Error('La hora de fin debe ser posterior al inicio, dentro del mismo día.');
}
export function endBefore(series: BookingSeries, cutoff: string): BookingSeries {
  const until = addDays(cutoff, -1);
  // No debe sobrevivir una excepción movida hacia el futuro desde una fecha anterior.
  const exceptions = Object.fromEntries(
    Object.entries(series.exceptions)
      .filter(
        ([original, exception]) =>
          original < cutoff || (!exception.cancelled && exception.date < cutoff),
      )
      .map(([original, exception]) => [
        original,
        !exception.cancelled && exception.date >= cutoff ? { cancelled: true as const } : exception,
      ]),
  );
  return { ...series, until, exceptions };
}
