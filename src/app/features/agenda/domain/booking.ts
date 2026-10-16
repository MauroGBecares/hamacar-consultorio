import { AuditEntry } from '@shared/models/audit-entry';

export interface BookingInput {
  professionalId: string;
  patientId: string;
  room: number;
  start: string;
  from: string;
  to: string;
  every: 0 | 7 | 14;
  until: string;
}
export type BookingException =
  { cancelled: true } | { cancelled: false; date: string; from: string; to: string; room: number };
export interface BookingSeries extends BookingInput {
  id: string;
  exceptions: Record<string, BookingException>;
}
export interface Occurrence extends BookingSeries {
  date: string;
  original: string;
  changed: boolean;
}
export interface AgendaEvent {
  version: number;
  patientId: string | null;
  until: string;
  id: string;
  date: string;
  original: string;
  from: string;
  to: string;
  room: number;
  professionalId: string;
  professional: string;
  patientName: string | null;
  every: number;
  changed: boolean;
  editable: boolean;
}
export interface AgendaState {
  series: BookingSeries[];
  audit: AuditEntry[];
}
export type BookingEditMode = 'new' | 'one' | 'future';
