import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'hm-resource-feedback',
  template: `
    @if (loading()) {
      <p class="notice" role="status">Cargando…</p>
    }
    @if (error()) {
      <div class="error" role="alert">
        No se pudieron cargar los datos.
        <button type="button" class="button" (click)="retry.emit()">Reintentar</button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResourceFeedback {
  readonly loading = input(false);
  readonly error = input<unknown>(undefined);
  readonly retry = output<void>();
}
