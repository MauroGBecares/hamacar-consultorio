import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Clock } from '@core/time/clock.service';
import { SessionService } from '@core/identity/session.service';
import { PatientsService } from '@features/patients/public-api';
import { Dialog } from '@shared/ui/dialog';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { Operation } from '@core/data-access/backend';
import { errorMessage } from '@shared/utils/text';
import { AgendaService } from '../data-access/agenda.service';
import { AgendaEvent, BookingEditMode, BookingInput } from '../domain/booking';

@Component({
  selector: 'hm-booking-editor',
  imports: [FormsModule, Dialog, ResourceFeedback],
  templateUrl: './booking-editor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingEditor {
  readonly event = input<AgendaEvent | null>(null);
  readonly mode = input<BookingEditMode>('new');
  readonly date = input.required<string>();
  readonly room = input(1);
  readonly closed = output<void>();
  readonly saved = output<string>();
  readonly session = inject(SessionService);
  private readonly civilClock = inject(Clock);
  get today(): string {
    return this.civilClock.today();
  }
  private readonly agenda = inject(AgendaService);
  private readonly patients = inject(PatientsService);
  readonly professionalId = signal(this.session.requireUser().id);
  readonly patientSearch = signal('');
  readonly patientCursor = signal('');
  readonly patientHistory = signal<string[]>([]);
  readonly patientResource = this.patients.directoryResource(
    computed(() => ({
      professionalId: this.professionalId(),
      search: this.patientSearch(),
      cursor: this.patientCursor(),
    })),
  );
  readonly patientOptions = computed(() =>
    this.patientResource.hasValue()
      ? this.patientResource.value().filter((p) => p.status !== 'Archivado')
      : [],
  );
  readonly pending = signal(false);
  private readonly operation = new Operation();
  readonly error = signal('');
  acknowledged = false;
  form: BookingInput = {
    professionalId: this.professionalId(),
    patientId: '',
    room: 1,
    start: this.today,
    from: '09:00',
    to: '09:45',
    every: 7,
    until: '',
  };
  constructor() {
    effect(() => {
      const event = this.event();
      const date = this.date();
      const room = this.room();
      // Inicializar por entrada, sin reiniciar el formulario al cambiar la profesional.
      untracked(() => {
        if (event) {
          this.professionalId.set(event.professionalId);
          this.form = {
            professionalId: event.professionalId,
            patientId: event.patientId ?? '',
            until: event.until,
            every: event.every as 0 | 7 | 14,
            start: event.date,
            from: event.from,
            to: event.to,
            room: event.room,
          };
        } else {
          this.form = {
            ...this.form,
            start: date < this.today ? this.today : date,
            room,
            patientId: '',
          };
        }
      });
    });
  }
  selectProfessional(id: string): void {
    this.professionalId.set(id);
    this.form.professionalId = id;
    this.form.patientId = '';
    this.patientCursor.set('');
    this.patientHistory.set([]);
  }
  searchPatients(search: string): void {
    this.patientSearch.set(search);
    this.patientCursor.set('');
    this.patientHistory.set([]);
    this.form.patientId = '';
  }
  nextPatients(): void {
    if (!this.patientResource.hasValue()) return;
    const items = this.patientResource.value();
    if (items.length < 50) return;
    this.patientHistory.update((history) => [...history, this.patientCursor()]);
    this.patientCursor.set(items.at(-1)!.id);
    this.form.patientId = '';
  }
  previousPatients(): void {
    const history = this.patientHistory();
    this.patientCursor.set(history.at(-1) ?? '');
    this.patientHistory.set(history.slice(0, -1));
    this.form.patientId = '';
  }
  async submit(): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    try {
      if (this.mode() === 'future' && !this.acknowledged)
        throw new Error('Confirmá el reemplazo de las repeticiones futuras.');
      const payload = { data: this.form, mode: this.mode(), event: this.event() };
      await this.agenda.save(this.form, this.mode(), this.event(), this.operation.key(payload));
      this.operation.confirmed();
      this.saved.emit(this.form.start);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
