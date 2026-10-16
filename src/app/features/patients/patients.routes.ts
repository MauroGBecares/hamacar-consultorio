import { Routes } from '@angular/router';
export const PATIENTS_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./pages/patients-page').then((m) => m.PatientsPage) },
  {
    path: ':id',
    loadComponent: () => import('./pages/patient-detail-page').then((m) => m.PatientDetailPage),
  },
];
