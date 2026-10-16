import { ClinicalRecord } from '../domain/clinical-record';

export function seedClinicalRecords(): ClinicalRecord[] {
  return [
    {
      id: 'record-1',
      patientId: 1,
      authorId: 2,
      author: 'Celina Lucero',
      discipline: 'Fonoaudiología',
      date: '2026-09-24',
      visibility: 'shared',
      text: 'Durante el juego compartido, Mateo inició intercambios espontáneos para pedir materiales y proponer turnos. Se retomarán estas situaciones en los próximos encuentros.',
      files: [],
      publishedAt: '2026-09-24T15:00:00Z',
    },
    {
      id: 'record-2',
      patientId: 1,
      authorId: 3,
      author: 'Estefanía Sasia',
      discipline: 'Terapia Ocupacional',
      date: '2026-09-18',
      visibility: 'shared',
      text: 'Participó de la secuencia de juego con mayor autonomía. La anticipación de los cambios de actividad favoreció su participación.',
      files: [],
      publishedAt: '2026-09-18T15:00:00Z',
    },
  ];
}
