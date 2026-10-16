import { Routes } from '@angular/router';
export const AGENDA_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./pages/agenda-page').then((m) => m.AgendaPage) },
];
