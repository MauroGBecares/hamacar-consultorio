import { AuditEntry } from '@shared/models/audit-entry';

export type PatientStatus = 'Activo' | 'En pausa' | 'Archivado';
export interface PatientData {
  name: string;
  birthDate: string;
  admission: string;
  school: string;
  insurance: string;
  cud: 'Sí' | 'No' | 'No informado';
  diagnosis: string;
  reason: string;
  family: string;
  relation: string;
  contact: string;
  referral: string;
  reentry: 'Sí' | 'No';
}
export interface Patient extends PatientData {
  id: string;
  version: number;
  status: PatientStatus;
  professionalIds: string[];
  closedAt?: string;
  closeReason?: string;
}
export interface PatientIdentity {
  id: string;
  name: string;
  insurance: string;
  cud: string;
  status: PatientStatus;
  professionalIds: readonly string[];
}
export interface PatientState {
  patients: Patient[];
  audit: AuditEntry[];
}
export const emptyPatient = (today: string): PatientData => ({
  name: '',
  birthDate: '',
  admission: today,
  school: '',
  insurance: '',
  cud: 'No informado',
  diagnosis: '',
  reason: '',
  family: '',
  relation: '',
  contact: '',
  referral: '',
  reentry: 'No',
});
