import { PatientData } from './patient';
import { validDate } from '@shared/utils/date';

export function validatePatient(data: PatientData, today: string): void {
  if (data.name.trim().length < 3 || data.name.length > 200)
    throw new Error('Completá el nombre y apellido (3 a 200 caracteres).');
  if (!data.admission || !validDate(data.admission) || data.admission > today)
    throw new Error('Completá una fecha de ingreso válida, hasta hoy.');
  if (
    data.birthDate &&
    (!validDate(data.birthDate) || data.birthDate > today || data.birthDate > data.admission)
  )
    throw new Error('El nacimiento debe ser una fecha válida anterior o igual al ingreso.');
  if (!['Sí', 'No', 'No informado'].includes(data.cud) || !['Sí', 'No'].includes(data.reentry))
    throw new Error('Revisá CUD y reingreso.');
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > (key === 'reason' ? 2000 : 200))
      throw new Error('Uno de los campos supera el largo permitido.');
  }
}
export function ageOn(birth: string, today: string): string {
  if (!birth) return 'Edad sin informar';
  const age =
    Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - Number(today.slice(5) < birth.slice(5));
  return `${age} años`;
}
