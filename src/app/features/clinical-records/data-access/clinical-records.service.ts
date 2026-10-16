import { inject, Injectable, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { Backend, json, remote, Row } from '@core/data-access/backend';
import { SessionService } from '@core/identity/session.service';
import { LocalFileStore } from '@core/files/local-file-store.service';
import { LocalAttachment } from '@shared/models/attachment';
import { ClinicalRecord, RecordDraft, RecordVisibility } from '../domain/clinical-record';
@Injectable({ providedIn: 'root' })
export class ClinicalRecordsService {
  private readonly backend = inject(Backend);
  private readonly session = inject(SessionService);
  private readonly files = inject(LocalFileStore);
  private readonly memory = new Map<string, RecordDraft>();
  constructor() {
    window.addEventListener('hamacar:identity-change', () => this.memory.clear());
  }
  listResource(
    patientId: Signal<string>,
    visibility: Signal<RecordVisibility>,
    cursor: Signal<string>,
    documentsOnly: Signal<boolean>,
  ) {
    return rxResource({
      params: () => ({
        patientId: patientId(),
        visibility: visibility(),
        cursor: cursor(),
        documentsOnly: documentsOnly(),
        user: this.session.user()?.id,
        revision: this.backend.revision(),
      }),
      defaultValue: [] as ClinicalRecord[],
      stream: ({ params }) =>
        params.user
          ? remote((signal) =>
              this.backend.client
                .rpc('clinical_page', { p_query: json(params) })
                .abortSignal(signal),
            ).pipe(map((rows) => rows as unknown as ClinicalRecord[]))
          : of([]),
    });
  }
  draftResource(patientId: Signal<string>, visibility: Signal<RecordVisibility>) {
    return rxResource({
      params: () => ({
        patientId: patientId(),
        visibility: visibility(),
        user: this.session.user()?.id,
      }),
      defaultValue: null as RecordDraft | null,
      stream: ({ params }) =>
        params.user
          ? remote<(Row<'clinical_drafts'> & { attachments: Row<'attachments'>[] }) | null>(
              (signal) =>
                this.backend.client
                  .from('clinical_drafts')
                  .select('*,attachments(*)')
                  .eq('patient_id', params.patientId)
                  .eq('visibility', params.visibility)
                  .eq('author_id', params.user!)
                  .abortSignal(signal)
                  .maybeSingle(),
            ).pipe(
              map((row): RecordDraft | null =>
                row
                  ? {
                      date: row.date,
                      text: row.text,
                      version: row.version,
                      files: row.attachments.map((a) => ({
                        id: a.id,
                        name: a.name,
                        size: a.size,
                        type: a.mime_type,
                        url: '',
                        lastModified: 0,
                        persisted: true,
                      })),
                    }
                  : null,
              ),
            )
          : of(null),
    });
  }
  remembered(patientId: string, visibility: RecordVisibility): RecordDraft | undefined {
    return this.memory.get(this.key(patientId, visibility));
  }
  remember(patientId: string, visibility: RecordVisibility, draft: RecordDraft): void {
    if (this.session.user())
      this.memory.set(this.key(patientId, visibility), {
        ...draft,
        files: draft.files.filter((f) => f.persisted),
      });
  }
  private key(patientId: string, visibility: RecordVisibility): string {
    return this.session.requireUser().id + ':' + patientId + ':' + visibility;
  }
  async saveDraft(
    patientId: string,
    visibility: RecordVisibility,
    draft: RecordDraft,
    operation: string,
  ): Promise<{ version: number; files: LocalAttachment[] }> {
    const files: LocalAttachment[] = [];
    for (const file of draft.files)
      files.push(await this.files.upload(file, { purpose: 'clinical', patientId, visibility }));
    const result = (await this.backend.command(
      'clinical_command',
      'draft',
      {
        patientId,
        visibility,
        date: draft.date,
        text: draft.text,
        files: files.map((f) => f.id),
        version: draft.version,
      },
      operation,
    )) as { version: number };
    return { ...result, files };
  }
  async publish(
    patientId: string,
    visibility: RecordVisibility,
    draft: RecordDraft,
    operation: string,
    correctsRecordId?: string,
    correctionReason?: string,
  ): Promise<void> {
    await this.backend.command(
      'clinical_command',
      'publish',
      {
        patientId,
        visibility,
        date: draft.date,
        text: draft.text,
        files: draft.files.map((f) => f.id),
        version: draft.version,
        correctsRecordId,
        correctionReason,
      },
      operation,
    );
    this.memory.delete(this.key(patientId, visibility));
    this.backend.refresh();
  }
}
