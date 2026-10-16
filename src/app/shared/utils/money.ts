export function parseMoney(value: string): number {
  const text = value.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text))
    throw new Error('Ingresá el monto sin separadores de miles, por ejemplo 25000,50.');
  const [whole, decimal = ''] = text.replace(',', '.').split('.');
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error('El importe debe ser mayor que cero y estar dentro del rango permitido.');
  return amount;
}
export const money = (cents: number): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100);
