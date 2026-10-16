import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'hm-not-found-page',
  imports: [RouterLink],
  template:
    '<section class="panel"><h1>Página no encontrada</h1><p>El enlace no corresponde a una sección disponible.</p><a class="button primary" routerLink="/inicio">Volver al inicio</a></section>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
