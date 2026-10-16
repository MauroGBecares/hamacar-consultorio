import { Routes } from '@angular/router';
import { authGuard } from '@core/identity/auth.guard';

export const routes: Routes = [
  {
    path: 'acceso',
    title: 'Acceso · Hamacar',
    loadComponent: () => import('./features/auth/pages/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio · Hamacar',
        loadComponent: () => import('./features/home/pages/home-page').then((m) => m.HomePage),
      },
      {
        path: 'pacientes',
        title: 'Pacientes · Hamacar',
        loadChildren: () =>
          import('./features/patients/patients.routes').then((m) => m.PATIENTS_ROUTES),
      },
      {
        path: 'agenda',
        title: 'Agenda · Hamacar',
        loadChildren: () => import('./features/agenda/agenda.routes').then((m) => m.AGENDA_ROUTES),
      },
      {
        path: 'liquidaciones',
        title: 'Liquidaciones · Hamacar',
        loadChildren: () =>
          import('./features/settlements/settlements.routes').then((m) => m.SETTLEMENT_ROUTES),
      },
      {
        path: '**',
        loadComponent: () => import('./layout/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
