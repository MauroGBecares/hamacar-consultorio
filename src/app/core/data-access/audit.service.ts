import { inject, Injectable, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { Backend, remote } from './backend';
import { SessionService } from '../identity/session.service';
import { AuditEntry } from '@shared/models/audit-entry';
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly backend = inject(Backend);
  private readonly session = inject(SessionService);
  resource(area: 'patients' | 'agenda' | 'finance', id: Signal<string>, cursor?: Signal<string>) {
    return rxResource({
      params: () => ({
        id: id(),
        cursor: cursor?.() ?? '',
        user: this.session.user()?.id,
        revision: this.backend.revision(),
      }),
      defaultValue: [] as AuditEntry[],
      stream: ({ params }) =>
        params.user && params.id
          ? remote((signal) =>
              this.backend.client
                .rpc('audit_page', {
                  p_area: area,
                  p_id: params.id,
                  p_cursor: params.cursor || undefined,
                })
                .abortSignal(signal),
            ).pipe(
              map((data) =>
                (
                  data as unknown as {
                    id: string;
                    entity_id: string;
                    action: string;
                    actor: string;
                    at: string;
                    changes: AuditEntry['changes'];
                  }[]
                ).map((row): AuditEntry => ({ ...row, entityId: row.entity_id })),
              ),
            )
          : of([]),
    });
  }
}
