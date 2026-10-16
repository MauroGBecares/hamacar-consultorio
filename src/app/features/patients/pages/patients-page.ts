import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { initials, normalize } from '@shared/utils/text';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { PatientStatus } from '../domain/patient';
import { ageOn } from '../domain/patient-rules';
import { PatientsService } from '../data-access/patients.service';
import { PatientForm } from '../ui/patient-form';

@Component({
  selector: 'hm-patients-page',
  imports: [FormsModule, RouterLink, ResourceFeedback, PatientForm],
  template: `
    <header class="page-heading">
      <div>
        <p class="eyebrow">Recorridos y equipo</p>
        <h1>Pacientes</h1>
      </div>
      <button class="button primary" (click)="adding.set(true)">＋ Agregar paciente</button>
    </header>
    <section class="panel">
      <div class="section-heading">
        <h2>Listado de pacientes</h2>
        <div class="tabs">
          <button [class.active]="!mine()" (click)="mine.set(false)">
            {{ session.isPartner() ? 'Todos' : 'Asignados' }}</button
          ><button [class.active]="mine()" (click)="mine.set(true)">Mis pacientes</button>
        </div>
      </div>
      <div class="tabs" aria-label="Estado de pacientes">
        <button [class.active]="status() === 'Activo'" (click)="status.set('Activo')">
          Activos</button
        ><button [class.active]="status() === 'En pausa'" (click)="status.set('En pausa')">
          En pausa</button
        ><button [class.active]="status() === 'Archivado'" (click)="status.set('Archivado')">
          Historial
        </button>
      </div>
      <label class="search-label"
        >Buscar paciente<input
          type="search"
          placeholder="Nombre o apellido…"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
      /></label>
      <hm-resource-feedback
        [loading]="service.patientsResource.isLoading()"
        [error]="service.patientsResource.error()"
        (retry)="service.patientsResource.reload()"
      />
      @for (patient of filtered(); track patient.id) {
        <a class="list-row" [routerLink]="['/pacientes', patient.id]"
          ><span class="avatar">{{ initials(patient.name) }}</span
          ><span class="grow"
            ><strong>{{ patient.name }}</strong
            ><small
              >{{ age(patient.birthDate) }} · {{ disciplines(patient.professionalIds) }}</small
            ></span
          ><span class="badge" [class.warm]="patient.status !== 'Activo'">{{ patient.status }}</span
          ><span>›</span></a
        >
      } @empty {
        @if (!service.patientsResource.isLoading() && !service.patientsResource.error()) {
          <p class="empty">No hay pacientes para esta búsqueda.</p>
        }
      }
      <div class="actions">
        <button class="button" (click)="previous()" [disabled]="!history.length">
          Página anterior</button
        ><button
          class="button"
          (click)="next()"
          [disabled]="service.patients().length < 50 || service.patientsResource.isLoading()"
        >
          Página siguiente
        </button>
      </div>
    </section>
    @if (adding()) {
      <hm-patient-form (closed)="adding.set(false)" (saved)="created($event)" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientsPage {
  readonly service = inject(PatientsService);
  readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly civilClock = inject(Clock);
  get today(): string {
    return this.civilClock.today();
  }
  readonly query = signal('');
  readonly status = signal<PatientStatus>('Activo');
  readonly mine = signal(false);
  readonly adding = signal(false);
  readonly initials = initials;
  readonly filtered = this.service.patients;
  history: string[] = [];
  constructor() {
    effect(() => {
      this.service.query.set(this.query());
      this.service.status.set(this.status());
      this.service.mine.set(this.mine());
      this.service.cursor.set('');
      this.history = [];
    });
  }
  next(): void {
    const last = this.filtered().at(-1);
    if (last) {
      this.history.push(this.service.cursor());
      this.service.cursor.set(last.id);
    }
  }
  previous(): void {
    this.service.cursor.set(this.history.pop() ?? '');
  }
  age(birth: string): string {
    return ageOn(birth, this.today);
  }
  disciplines(ids: string[]): string {
    return [
      ...new Set(
        ids
          .map((id) => this.session.users().find((user) => user.id === id)?.discipline)
          .filter(Boolean),
      ),
    ].join(' · ');
  }
  created(id: string): void {
    this.adding.set(false);
    void this.router.navigate(['/pacientes', id]);
  }
}
