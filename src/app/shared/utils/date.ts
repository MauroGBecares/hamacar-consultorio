const DAY = 86_400_000;
export const dayNumber = (date: string): number =>
  Math.floor(Date.parse(`${date}T12:00:00Z`) / DAY);
export const addDays = (date: string, amount: number): string =>
  new Date((dayNumber(date) + amount) * DAY).toISOString().slice(0, 10);
export function validDate(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(dayNumber(date)) &&
    addDays(date, 0) === date
  );
}
export function validMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}
export function shiftMonth(date: string, amount: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + amount, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}
export function weekStart(date: string): string {
  return addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
}
export const formatDate = (date: string): string =>
  validDate(date)
    ? new Intl.DateTimeFormat('es-AR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${date}T12:00:00Z`))
    : 'Sin fecha';
export const formatMonth = (month: string): string =>
  new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
export const dueDate = (month: string): string => shiftMonth(`${month}-05`, 1);
