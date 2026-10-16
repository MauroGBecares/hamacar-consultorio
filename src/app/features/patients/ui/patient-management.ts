import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '@core/identity/session.service';
import { Dialog } from '@shared/ui/dialog';
import { errorMessage } from '@shared/utils/text';
import { Patient, PatientStatus } from '../domain/patient';
import { PatientsService } from '../data-access/patients.service';
import { Operation } from '@core/data-access/backend';

@Component({
  selector: 'hm-patient-management',
  imports: [FormsModule, Dialog],
  template: ` <hm-dialog title="Equipo y estado" (closed)="!pending() && closed.emit()"
    ><form (ngSubmit)="save()">
      <h3>{{ patient().name }}</h3>
      <fieldset [disabled]="pending()">
        <legend>Profesionales asignadas</legend>
        @for (user of session.activeUsers(); track user.id) {
          <label class="check"
            ><input
              type="checkbox"
              [checked]="ids().includes(user.id)"
              (change)="toggle(user.id)"
            /><span
              >{{ user.fullName }}<small>{{ user.discipline }}</small></span
            ></label
          >
        }
      </fieldset>
      <label
        >Estado<select name="status" [(ngModel)]="status">
          <option>Activo</option>
          <option>En pausa</option>
          <option>Archivado</option>
        </select></label
      >
      <label
        >Motivo del cambio de estado<textarea
          name="reason"
          [(ngModel)]="reason"
          maxlength="1000"
        ></textarea>
      </label>
      <p class="notice">
        Archivar conserva historia, documentos y liquidaciones. Las reservas existentes no se
        cancelan automáticamente: revisalas en Agenda.
      </p>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <button class="button primary" [disabled]="pending()">
        {{ pending() ? 'Guardando…' : 'Guardar equipo y estado' }}
      </button>
    </form></hm-dialog
  >`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientManagement {
  readonly patient = input.required<Patient>();
  readonly closed = output<void>();
  readonly saved = output<void>();
  readonly session = inject(SessionService);
  private readonly patients = inject(PatientsService);
  readonly ids = signal<string[]>([]);
  readonly error = signal('');
  readonly pending = signal(false);
  private readonly operation = new Operation();
  private initialized = false;
  private version = 1;
  status: PatientStatus = 'Activo';
  reason = '';
  constructor() {
    effect(() => {
      if (this.initialized) return;
      this.initialized = true;
      this.version = this.patient().version;
      this.ids.set([...this.patient().professionalIds]);
      this.status = this.patient().status;
    });
  }
  toggle(id: string): void {
    this.ids.update((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }
  async save(): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    try {
      const payload = {
        id: this.patient().id,
        ids: this.ids(),
        status: this.status,
        reason: this.reason,
        version: this.version,
      };
      await this.patients.manage(
        this.patient().id,
        this.ids(),
        this.status,
        this.reason,
        this.version,
        this.operation.key(payload),
      );
      this.operation.confirmed();
      this.saved.emit();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
