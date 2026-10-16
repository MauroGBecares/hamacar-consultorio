export interface AuditEntry {
  id: string;
  entityId: string;
  action: string;
  actor: string;
  at: string;
  changes: { field: string; before: string; after: string }[];
}
export interface Note {
  text: string;
  author: string;
  at: string;
}
