import { AuditEntry, Note } from '@shared/models/audit-entry';
import { LocalAttachment } from '@shared/models/attachment';

export type PaymentState = 'informed' | 'observed' | 'verified' | 'replaced';
export type SettlementStatus =
  'Sin cargar' | 'Borrador' | 'Pendiente de revisión' | 'Confirmado' | 'Para corregir';
export interface ServicePeriod {
  version: number;
  persisted?: boolean;
  id: string;
  professionalId: string;
  patientId: string;
  patientName: string;
  month: string;
  mode: 'Particular' | 'Cobertura' | null;
  coverage: string;
  cud: string;
  declared: boolean;
  complete: boolean;
  noService: boolean;
  performed: number;
  sessionsPaid: number;
  notes: Note[];
}
export interface Collection {
  version: number;
  cancelled?: boolean;
  id: string;
  professionalId: string;
  periodId: string;
  date: string;
  receivedCents: number | null;
  contributionCents: number;
  settlementId: string | null;
  // Snapshot histórico: editar cobertura/equipo no reescribe conceptos ya cargados.
  patientName: string;
  mode: 'Particular' | 'Cobertura';
  coverage: string;
  discipline: string;
  sessionsPaid: number;
}
export interface Settlement {
  version: number;
  persisted?: boolean;
  id: string;
  professionalId: string;
  month: string;
  notes: Note[];
}
export interface Transfer {
  version: number;
  id: string;
  settlementId: string;
  date: string;
  amountCents: number;
  state: PaymentState;
  receipt: LocalAttachment;
  notes: Note[];
  verifiedBy?: string;
  verifiedAt?: string;
  replacesId?: string;
}
export interface FinanceState {
  periods: ServicePeriod[];
  collections: Collection[];
  settlements: Settlement[];
  transfers: Transfer[];
  audit: AuditEntry[];
}
export interface CollectionInput {
  mode?: 'Particular' | 'Cobertura';
  date: string;
  contribution: string;
  received: string;
  performed: number;
  sessionsPaid: number;
  complete: boolean;
  observation: string;
}
export interface TransferInput {
  date: string;
  amount: string;
  receipt: File | null;
  observation: string;
  replacesId?: string;
}
export const emptyFinance = (): FinanceState => ({
  periods: [],
  collections: [],
  settlements: [],
  transfers: [],
  audit: [],
});
