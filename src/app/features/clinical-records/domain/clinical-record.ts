import { LocalAttachment } from '@shared/models/attachment';

export type RecordVisibility = 'shared' | 'private';
export interface RecordDraft {
  version: number;
  date: string;
  text: string;
  files: LocalAttachment[];
}
export interface ClinicalRecord extends RecordDraft {
  id: string;
  patientId: string;
  authorId: string;
  author: string;
  discipline: string;
  visibility: RecordVisibility;
  publishedAt: string;
  correctsRecordId?: string;
  correctionReason?: string;
}
