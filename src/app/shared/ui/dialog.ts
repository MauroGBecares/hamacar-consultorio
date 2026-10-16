import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';

import { APP_LOCKED } from '../models/app-locked';
@Component({
  selector: 'hm-dialog',
  template: `
    <dialog #dialog (cancel)="cancel($event)" aria-labelledby="dialog-title">
      <header class="dialog-header">
        <h2 id="dialog-title">{{ title() }}</h2>
        <button type="button" class="icon-button" (click)="closed.emit()" aria-label="Cerrar">
          ×
        </button>
      </header>
      <div class="dialog-body"><ng-content /></div>
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog implements OnDestroy {
  readonly title = input.required<string>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly locked = inject(APP_LOCKED);
  private readonly rendered = signal(false);
  constructor() {
    afterNextRender(() => this.rendered.set(true));
    effect(() => {
      if (!this.rendered()) return;
      const dialog = this.dialog().nativeElement;
      if (this.locked()) dialog.close();
      else if (!dialog.open) dialog.showModal();
    });
  }
  ngOnDestroy(): void {
    this.dialog().nativeElement.close();
  }
  cancel(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }
}
