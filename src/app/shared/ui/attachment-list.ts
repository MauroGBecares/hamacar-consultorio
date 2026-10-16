import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { ATTACHMENT_ACCESS } from '@shared/models/attachment-access';
import { LocalAttachment } from '@shared/models/attachment';
import { errorMessage } from '@shared/utils/text';
@Component({
  selector: 'hm-attachment-list',
  template: `
    @for (file of files(); track file.id) {
      <div class="attachment">
        <button
          class="text-button"
          type="button"
          (click)="download(file)"
          [disabled]="resource.isLoading()"
        >
          ↓ {{ file.name }} <small>{{ (file.size / 1024).toFixed(0) }} KB</small>
        </button>
        @if (editable()) {
          <button
            type="button"
            class="icon-button"
            (click)="removed.emit(file.id)"
            [attr.aria-label]="'Quitar ' + file.name"
          >
            ×
          </button>
        }
      </div>
    }
    @if (resource.isLoading()) {
      <p role="status">Descargando archivo…</p>
    }
    @if (resource.error()) {
      <p class="error" role="alert">{{ message(resource.error()) }}</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttachmentList {
  readonly files = input<readonly LocalAttachment[]>([]);
  readonly editable = input(false);
  readonly removed = output<string>();
  private readonly store = inject(ATTACHMENT_ACCESS);
  private readonly request = signal<LocalAttachment | null>(null);
  private readonly urls = new Set<string>();
  readonly message = errorMessage;
  readonly resource = rxResource({
    params: () => ({ file: this.request(), user: this.store.available() }),
    defaultValue: null as Blob | null,
    stream: ({ params }) =>
      params.user && params.file ? this.store.download(params.file.id) : of(null),
  });
  constructor() {
    effect(() => {
      if (
        this.resource.hasValue() &&
        !this.resource.isLoading() &&
        this.resource.value() &&
        this.request() &&
        this.store.available()
      ) {
        this.saveBlob(this.resource.value()!, this.request()!.name);
        this.request.set(null);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      for (const url of this.urls) this.store.revoke(url);
    });
  }
  download(file: LocalAttachment): void {
    const local = this.store.file(file.id);
    if (local) this.saveBlob(local, file.name);
    else this.request.set(file);
  }
  private saveBlob(blob: Blob, name: string): void {
    const url = this.store.createUrl(blob);
    this.urls.add(url);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    link.click();
    setTimeout(() => {
      this.store.revoke(url);
      this.urls.delete(url);
    }, 3000);
  }
}
