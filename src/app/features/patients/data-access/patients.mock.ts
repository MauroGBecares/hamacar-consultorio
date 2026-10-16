import { Patient, emptyPatient } from '../domain/patient';

export function seedPatients(): Patient[] {
  const names = [
    'Mateo García',
    'Emma Rodríguez',
    'Benicio López',
    'Juana Fernández',
    'Santino Pérez',
  ];
  const births = ['2017-03-14', '2019-05-12', '2020-06-03', '2016-01-09', '2018-02-19'];
  const admissions = ['2026-03-01', '2026-04-01', '2026-06-01', '2026-02-01', '2026-08-01'];
  const families = [
    'Lucía García',
    'Martín Rodríguez',
    'Paula López',
    'Carolina Fernández',
    'Andrea Pérez',
  ];
  const schools = ['San José', 'del Parque', 'Belgrano', 'del Sol', 'Sarmiento'];
  const insurances = ['OSDE', 'IAPOS', 'Swiss Medical', 'OSDE', 'IAPOS'];
  const reasons = [
    'Acompañar el desarrollo de la comunicación y la participación en las actividades cotidianas.',
    'Favorecer la expresión y los intercambios a través del juego.',
    'Acompañar la autonomía en las rutinas y la participación en el juego.',
    'Fortalecer los recursos comunicativos en distintos entornos.',
    'Ofrecer un espacio de expresión y acompañamiento a través del juego.',
  ];
  return names.map((name, i) => ({
    ...emptyPatient(admissions[i]),
    id: i + 1,
    name,
    birthDate: births[i],
    family: families[i],
    relation: i === 1 ? 'Padre' : 'Madre',
    school: `Escuela ${schools[i]}`,
    insurance: insurances[i],
    reason: reasons[i],
    cud: [0, 2].includes(i) ? 'Sí' : i === 3 ? 'No' : 'No informado',
    status: i === 3 ? 'En pausa' : 'Activo',
    professionalIds: Array.from({ length: 10 }, (_, n) => n + 1).filter((id) =>
      [((id - 1) % 5) + 1, (id % 5) + 1].includes(i + 1),
    ),
  }));
}
