import { Routes } from '@angular/router';
export const SETTLEMENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/settlements-page').then((m) => m.SettlementsPage),
  },
];
