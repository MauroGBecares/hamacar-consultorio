import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { AttachmentList } from '@shared/ui/attachment-list';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { formatDate } from '@shared/utils/date';
import { ClinicalRecordsService } from '../data-access/clinical-records.service';
import { RecordVisibility } from '../domain/clinical-record';
import { RecordEditor } from './record-editor';
import { ClinicalRecord } from '../domain/clinical-record';
import { SessionService } from '@core/identity/session.service';

@Component({
  selector: 'hm-records-panel',
  imports: [AttachmentList, ResourceFeedback, RecordEditor],
  template: `
    <section class="panel">
      <header class="section-heading">
        <h2>
          {{
            documentsOnly()
              ? 'Documentos compartidos'
              : visibility() === 'private'
                ? 'Mis notas profesionales'
                : 'Historia compartida'
          }}
        </h2>
        @if (!readonly()) {
          <button class="button primary" (click)="editing.set(true)">
            {{ visibility() === 'private' ? '＋ Crear nota privada' : '＋ Registrar evolución' }}
          </button>
        }
      </header>
      <hm-resource-feedback
        [loading]="resource.isLoading()"
        [error]="resource.error()"
        (retry)="resource.reload()"
      />
      @for (record of records(); track record.id) {
        <article class="timeline-item">
          <p class="muted">
            {{ date(record.date) }} · {{ record.author }} · {{ record.discipline }}
          </p>
          @if (!documentsOnly()) {
            <p class="preserve-text">{{ record.text }}</p>
          }
          <hm-attachment-list [files]="record.files" />
          @if (record.correctsRecordId) {
            <p class="muted">
              Rectificación del registro {{ record.correctsRecordId }} ·
              {{ record.correctionReason }}
            </p>
          }
          @if (!readonly() && record.authorId === session.user()?.id) {
            <button class="text-button" (click)="correction.set(record); editing.set(true)">
              Rectificar
            </button>
          }
        </article>
      } @empty {
        @if (!resource.isLoading() && !resource.error()) {
          <p class="empty">
            Todavía no hay {{ documentsOnly() ? 'documentos' : 'registros' }} en esta sección.
          </p>
        }
      }
      @if (!limit()) {
        <div class="actions">
          <button class="button" (click)="previous()" [disabled]="!history.length">
            Página anterior</button
          ><button class="button" (click)="next()" [disabled]="records().length < 50">
            Página siguiente
          </button>
        </div>
      }
    </section>
    @if (editing()) {
      <hm-record-editor
        [patientId]="patientId()"
        [kind]="visibility()"
        [correction]="correction()"
        (closed)="editing.set(false); correction.set(null)"
        (published)="editing.set(false); correction.set(null)"
      />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordsPanel {
  readonly patientId = input.required<string>();
  readonly visibility = input<RecordVisibility>('shared');
  readonly readonly = input(false);
  readonly documentsOnly = input(false);
  readonly limit = input(0);
  readonly editing = signal(false);
  readonly session = inject(SessionService);
  readonly correction = signal<ClinicalRecord | null>(null);
  readonly cursor = signal('');
  history: string[] = [];
  readonly resource = inject(ClinicalRecordsService).listResource(
    this.patientId,
    this.visibility,
    this.cursor,
    this.documentsOnly,
  );
  next(): void {
    const last = this.records().at(-1);
    if (last) {
      this.history.push(this.cursor());
      this.cursor.set(last.id);
    }
  }
  previous(): void {
    this.cursor.set(this.history.pop() ?? '');
  }
  readonly records = computed(() => {
    const values = this.resource.hasValue()
      ? this.resource.value().filter((r) => !this.documentsOnly() || r.files.length > 0)
      : [];
    return this.limit() ? values.slice(0, this.limit()) : values;
  });
  readonly date = formatDate;
}
