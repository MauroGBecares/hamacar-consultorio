import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Clock } from '@core/time/clock.service';
import { Operation } from '@core/data-access/backend';
import { Dialog } from '@shared/ui/dialog';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { errorMessage } from '@shared/utils/text';
import { PatientsService } from '../data-access/patients.service';
import { emptyPatient, Patient, PatientData } from '../domain/patient';
@Component({
  selector: 'hm-patient-form',
  imports: [FormsModule, Dialog, RouterLink, ResourceFeedback],
  templateUrl: './patient-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientForm {
  readonly patient = input<Patient | null>(null);
  readonly closed = output<void>();
  readonly saved = output<string>();
  private readonly civilClock = inject(Clock);
  get today(): string {
    return this.civilClock.today();
  }
  private readonly patients = inject(PatientsService);
  readonly error = signal('');
  readonly pending = signal(false);
  readonly name = signal('');
  readonly duplicateResource = this.patients.duplicateResource(
    this.name,
    computed(() => this.patient()?.id ?? ''),
  );
  readonly duplicates = computed(() =>
    this.duplicateResource.hasValue() ? this.duplicateResource.value() : [],
  );
  form: PatientData = emptyPatient(this.today);
  acknowledged = false;
  private initialized = false;
  private version = 1;
  private readonly operation = new Operation();
  constructor() {
    effect(() => {
      const p = this.patient();
      if (!p || this.initialized) return;
      this.initialized = true;
      this.version = p.version;
      const { id, status, professionalIds, closedAt, closeReason, version, ...data } = p;
      this.form = { ...data };
      this.name.set(p.name);
    });
  }
  async submit(): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    try {
      if (this.name() !== this.form.name) {
        this.name.set(this.form.name);
        throw new Error('Esperá a que termine la búsqueda de coincidencias.');
      }
      if (this.duplicateResource.isLoading())
        throw new Error('Esperá a que termine la búsqueda de coincidencias.');
      if (this.duplicateResource.error())
        throw new Error('No se pudieron comprobar coincidencias. Reintentá la consulta.');
      if (this.duplicates().length && !this.acknowledged)
        throw new Error('Revisá la coincidencia antes de guardar.');
      const payload = {
        data: this.form,
        id: this.patient()?.id,
        version: this.version,
        acknowledged: this.acknowledged,
      };
      const id = await this.patients.save(
        this.form,
        this.patient()?.id,
        this.acknowledged,
        this.version,
        this.operation.key(payload),
      );
      this.operation.confirmed();
      this.saved.emit(id);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
