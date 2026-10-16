import { InjectionToken, Signal } from '@angular/core';
import { Observable } from 'rxjs';
/** Shared UI consumes this port without depending on authentication or a backend SDK. */
export interface AttachmentAccess {
  available: Signal<boolean>;
  file(id: string): File | undefined;
  download(id: string): Observable<Blob>;
  createUrl(blob: Blob): string;
  revoke(url: string): void;
}
export const ATTACHMENT_ACCESS = new InjectionToken<AttachmentAccess>('ATTACHMENT_ACCESS');
