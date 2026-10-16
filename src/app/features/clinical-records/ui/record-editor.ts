import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocalFileStore } from '@core/files/local-file-store.service';
import { SessionService } from '@core/identity/session.service';
import { Operation, RemoteError } from '@core/data-access/backend';
import { Clock } from '@core/time/clock.service';
import { AttachmentList } from '@shared/ui/attachment-list';
import { Dialog } from '@shared/ui/dialog';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { errorMessage } from '@shared/utils/text';
import { ClinicalRecordsService } from '../data-access/clinical-records.service';
import { ClinicalRecord, RecordDraft, RecordVisibility } from '../domain/clinical-record';
import { LocalDictation } from '../dictation/local-dictation.service';
@Component({
  selector: 'hm-record-editor',
  imports: [FormsModule, Dialog, AttachmentList, ResourceFeedback],
  providers: [LocalDictation],
  templateUrl: './record-editor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordEditor implements OnDestroy {
  readonly patientId = input.required<string>();
  readonly kind = input<RecordVisibility>('shared');
  readonly correction = input<ClinicalRecord | null>(null);
  readonly closed = output<void>();
  readonly published = output<void>();
  readonly voice = inject(LocalDictation);
  private readonly civilClock = inject(Clock);
  get today(): string {
    return this.civilClock.today();
  }
  private readonly records = inject(ClinicalRecordsService);
  private readonly files = inject(LocalFileStore);
  private readonly session = inject(SessionService);
  readonly resource = this.records.draftResource(this.patientId, this.kind);
  readonly error = signal('');
  readonly confirmClose = signal(false);
  readonly publishing = signal(false);
  readonly status = signal<'loading' | 'saved' | 'saving' | 'unsaved' | 'conflict'>('loading');
  readonly initialized = signal(false);
  readonly remoteDraft = signal<RecordDraft | null>(null);
  draft: RecordDraft = { date: this.today, text: '', files: [], version: 0 };
  correctionReason = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flight: Promise<void> | null = null;
  private pending: { snapshot: RecordDraft; operation: string; edit: number } | null = null;
  private needsReconcile = false;
  private edit = 0;
  private savedEdit = 0;
  private publishedSuccessfully = false;
  private readonly localFileIds = new Set<string>();
  private readonly publishOperation = new Operation();
  private readonly onLock = () => {
    this.needsReconcile = true;
    this.voice.cancel();
    clearTimeout(this.timer);
    this.draft = { ...this.draft, files: this.draft.files.filter((f) => f.persisted) };
    if (this.status() === 'saving') this.status.set('unsaved');
  };
  constructor() {
    effect(() => {
      if (this.resource.isLoading() || this.resource.error() || !this.session.user()) return;
      const remote = this.resource.value() ?? { date: this.today, text: '', files: [], version: 0 };
      this.remoteDraft.set(remote);
      if (this.initialized()) {
        if (this.needsReconcile) {
          this.needsReconcile = false;
          this.pending = null;
          if (this.draft.version !== remote.version) {
            this.status.set('conflict');
            this.error.set(
              'El borrador cambió mientras la sesión estaba bloqueada. Compará los textos.',
            );
          } else {
            this.status.set('unsaved');
            this.persist();
          }
        }
        return;
      }
      const local = this.records.remembered(this.patientId(), this.kind());
      this.draft = local ?? remote;
      this.initialized.set(true);
      if (local && local.version !== remote.version) {
        this.status.set('conflict');
        this.error.set('El borrador remoto cambió. Compará los textos antes de guardar.');
      } else {
        this.status.set(local ? 'unsaved' : 'saved');
        if (local) {
          this.edit++;
          this.persist();
        }
      }
    });
    effect(() => {
      const text = this.voice.transcript();
      if (text) {
        this.draft = {
          ...this.draft,
          text: this.draft.text + (this.draft.text.trim() ? '\n\n' : '') + text,
        };
        this.persist();
        this.voice.transcript.set('');
      }
    });
    window.addEventListener('hamacar:lock', this.onLock);
  }
  persist(): void {
    if (!this.initialized()) return;
    this.edit++;
    this.records.remember(this.patientId(), this.kind(), this.draft);
    clearTimeout(this.timer);
    if (this.status() === 'conflict') return;
    this.status.set('unsaved');
    this.timer = setTimeout(() => void this.flush().catch(() => {}), 1000);
  }
  retry(): void {
    void this.flush().catch(() => {});
  }
  private flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.flight) return this.flight;
    this.flight = (async () => {
      while (this.savedEdit < this.edit || this.pending) {
        if (!this.session.user()) throw new Error('Ingresá nuevamente para guardar el borrador.');
        if (this.status() === 'conflict')
          throw new Error('Resolvé el conflicto de versiones antes de guardar.');
        this.pending ??= {
          snapshot: { ...this.draft, files: [...this.draft.files] },
          operation: crypto.randomUUID(),
          edit: this.edit,
        };
        const pending = this.pending;
        this.status.set('saving');
        this.error.set('');
        try {
          const result = await this.records.saveDraft(
            this.patientId(),
            this.kind(),
            pending.snapshot,
            pending.operation,
          );
          const replacements = new Map(
            pending.snapshot.files.map((file, index) => [file.id, result.files[index]]),
          );
          this.draft = {
            ...this.draft,
            version: result.version,
            files: this.draft.files.map((f) => replacements.get(f.id) ?? f),
          };
          for (const f of pending.snapshot.files) if (!f.persisted) this.files.remove(f.id);
          this.savedEdit = pending.edit;
          this.pending = null;
          this.records.remember(this.patientId(), this.kind(), this.draft);
          this.status.set(this.savedEdit === this.edit ? 'saved' : 'unsaved');
        } catch (error) {
          if (error instanceof RemoteError && error.code === 'PT409') {
            this.status.set('conflict');
            this.resource.reload();
          } else this.status.set('unsaved');
          this.error.set(errorMessage(error));
          throw error;
        }
      }
    })().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  resolve(useRemote: boolean): void {
    const remote = this.remoteDraft();
    if (!remote) return;
    this.pending = null;
    this.draft = useRemote
      ? { ...remote, files: [...remote.files] }
      : { ...this.draft, version: remote.version };
    this.status.set('unsaved');
    this.error.set('');
    this.persist();
  }
  addFiles(list: FileList | null): void {
    if (this.publishing()) return;
    this.error.set('');
    for (const file of Array.from(list ?? [])) {
      try {
        if (this.draft.files.length >= 5) throw new Error('Podés adjuntar hasta cinco archivos.');
        const attachment = this.files.add(file, 'clinical');
        this.localFileIds.add(attachment.id);
        this.draft = {
          ...this.draft,
          files: [...this.draft.files, attachment],
        };
      } catch (error) {
        this.error.set(errorMessage(error));
        break;
      }
    }
    this.persist();
  }
  removeFile(id: string): void {
    this.draft = { ...this.draft, files: this.draft.files.filter((f) => f.id !== id) };
    this.persist();
  }
  async close(): Promise<void> {
    if (this.publishing() || this.flight) return;
    if (this.voice.busy()) {
      this.confirmClose.set(true);
      return;
    }
    try {
      await this.flush();
      this.closed.emit();
    } catch {
      /* Keep unsaved text visible. */
    }
  }
  discardAudioAndClose(): void {
    this.voice.cancel();
    void this.close();
  }
  closeWithPendingText(): void {
    this.records.remember(this.patientId(), this.kind(), this.draft);
    this.closed.emit();
  }
  async publish(): Promise<void> {
    if (this.voice.busy() || this.publishing() || !this.initialized()) return;
    this.publishing.set(true);
    try {
      await this.flush();
      const payload = {
        draft: this.draft,
        correctsRecordId: this.correction()?.id,
        reason: this.correctionReason,
      };
      await this.records.publish(
        this.patientId(),
        this.kind(),
        this.draft,
        this.publishOperation.key(payload),
        this.correction()?.id,
        this.correctionReason,
      );
      this.publishedSuccessfully = true;
      this.publishOperation.confirmed();
      this.published.emit();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.publishing.set(false);
    }
  }
  ngOnDestroy(): void {
    clearTimeout(this.timer);
    this.voice.cancel();
    window.removeEventListener('hamacar:lock', this.onLock);
    if (!this.publishedSuccessfully && this.initialized())
      this.records.remember(this.patientId(), this.kind(), this.draft);
    for (const id of this.localFileIds) this.files.remove(id);
    this.localFileIds.clear();
  }
}
