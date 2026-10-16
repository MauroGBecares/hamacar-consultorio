import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { RecordsPanel } from '@features/clinical-records/public-api';
import { AgendaService } from '@features/agenda/public-api';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { Dialog } from '@shared/ui/dialog';
import { formatDate } from '@shared/utils/date';
import { PatientsService } from '../data-access/patients.service';
import { Patient } from '../domain/patient';
import { ageOn } from '../domain/patient-rules';
import { PatientForm } from '../ui/patient-form';
import { PatientManagement } from '../ui/patient-management';

@Component({
  selector: 'hm-patient-detail-page',
  imports: [RouterLink, ResourceFeedback, Dialog, PatientForm, PatientManagement, RecordsPanel],
  templateUrl: './patient-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientDetailPage {
  readonly id = input.required<string>();
  readonly patientId = computed(() => this.id());
  readonly session = inject(SessionService);
  private readonly civilClock = inject(Clock);
  get today(): string {
    return this.civilClock.today();
  }
  readonly service = inject(PatientsService);
  readonly resource = this.service.detailResource(this.patientId);
  private readonly snapshot = signal<Patient | null>(null);
  readonly patient = this.snapshot.asReadonly();
  constructor() {
    effect(() => {
      if (this.session.user() && !this.resource.isLoading() && !this.resource.error())
        this.snapshot.set(this.resource.value() ?? null);
    });
  }
  readonly auditCursor = signal('');
  readonly auditHistory = signal<string[]>([]);
  auditNext(id: string): void {
    this.auditHistory.update((h) => [...h, this.auditCursor()]);
    this.auditCursor.set(id);
  }
  auditPrevious(): void {
    const h = this.auditHistory();
    this.auditCursor.set(h.at(-1) ?? '');
    this.auditHistory.set(h.slice(0, -1));
  }
  readonly audit = this.service.auditResource(this.patientId, this.auditCursor);
  readonly next = inject(AgendaService).nextResource(this.patientId);
  readonly nextEvent = computed(() => (this.next.hasValue() ? this.next.value() : null));
  readonly tab = signal('Resumen');
  readonly dialog = signal<'edit' | 'management' | 'audit' | null>(null);
  readonly tabs = ['Resumen', 'Historia', 'Documentos', 'Equipo', 'Mis notas'];
  readonly date = formatDate;
  readonly age = ageOn;
  readonly team = computed(() =>
    this.session.users().filter((u) => this.patient()?.professionalIds.includes(u.id)),
  );
}
