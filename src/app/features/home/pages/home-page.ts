import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { SettlementsService, settlementStatus } from '@features/settlements/public-api';
import { formatMonth } from '@shared/utils/date';
import { ResourceFeedback } from '@shared/ui/resource-feedback';

@Component({
  selector: 'hm-home-page',
  imports: [RouterLink, ResourceFeedback],
  template: `
    <header class="page-heading">
      <div>
        <p class="eyebrow">Nuestro espacio de trabajo</p>
        <h1>Hola, {{ session.user()?.name }}</h1>
      </div>
    </header>
    <hm-resource-feedback
      [loading]="resource.isLoading()"
      [error]="resource.error()"
      (retry)="resource.reload()"
    />
    @if (resource.hasValue() && resource.value() && !resource.error()) {
      <a
        class="home-task"
        routerLink="/liquidaciones"
        [queryParams]="session.isPartner() ? { attention: 'informed' } : {}"
        ><span
          ><small>{{ session.isPartner() ? 'Gestión del espacio' : 'Mis liquidaciones' }}</small
          ><strong>{{ task() }}</strong></span
        ><span>Ver →</span></a
      >
    }
    <div class="home-shortcuts">
      <a class="panel shortcut" routerLink="/pacientes"
        ><span class="shortcut-icon" aria-hidden="true">♧</span>
        <h2>Pacientes</h2>
        <p>Registros y documentos →</p></a
      ><a class="panel shortcut" routerLink="/agenda"
        ><span class="shortcut-icon" aria-hidden="true">▦</span>
        <h2>Agenda</h2>
        <p>Consultar y reservar horarios →</p></a
      ><a class="panel shortcut" routerLink="/liquidaciones"
        ><span class="shortcut-icon" aria-hidden="true">≡</span>
        <h2>Liquidaciones</h2>
        <p>{{ session.isPartner() ? 'Gestión del equipo' : 'Cobros y transferencias' }} →</p></a
      >
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  readonly session = inject(SessionService);
  private readonly finance = inject(SettlementsService);
  private readonly clock = inject(Clock);
  private readonly month = computed(() => this.clock.today().slice(0, 7));
  readonly resource = this.finance.homeResource(this.month);
  readonly task = computed(() => {
    const state = this.resource.hasValue() ? this.resource.value() : null;
    if (!state) return '';
    if (this.session.isPartner()) {
      const count = state.pendingCount;
      return count ? `${count} transferencias por revisar` : 'Sin transferencias por revisar';
    }
    return `${formatMonth(this.month())} · ${state.status}`;
  });
}
