import { User } from './user';

export const testUserId = (id: number): string =>
  '00000000-0000-4000-8000-' + String(id).padStart(12, '0');
export const USERS: readonly User[] = [
  ['Antonela', 'Antonela Bécares', 'Fonoaudiología'],
  ['Celina', 'Celina Lucero', 'Fonoaudiología'],
  ['Estefanía', 'Estefanía Sasia', 'Terapia Ocupacional'],
  ['Aldana', 'Aldana Fantini', 'Psicología'],
  ['Caren', 'Caren Bravo', 'Psicología'],
  ['Giuliana', 'Giuliana Lencina', 'Psicología'],
  ['Sabrina', 'Sabrina Cinelli', 'Psicopedagogía'],
  ['Gina', 'Gina Tempesta', 'Psicopedagogía'],
  ['Coralí', 'Coralí Maldonado', 'Musicoterapia'],
  ['Melody', 'Melody Volken', 'Psicopedagogía'],
].map(([name, fullName, discipline], i) => ({
  id: testUserId(i + 1),
  active: true,
  name,
  fullName,
  discipline,
  role: i < 3 ? 'partner' : 'professional',
}));
