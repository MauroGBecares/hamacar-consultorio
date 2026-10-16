import { AuditService } from '@core/data-access/audit.service';
import { inject, Injectable, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { Backend, json, remote } from '@core/data-access/backend';
import { Clock } from '@core/time/clock.service';
import { SessionService } from '@core/identity/session.service';
import { AuditEntry } from '@shared/models/audit-entry';
import { AgendaEvent, BookingEditMode, BookingInput } from '../domain/booking';
export interface AgendaQuery {
  from: string;
  to: string;
  room: number;
  professionalId: string;
}
@Injectable({ providedIn: 'root' })
export class AgendaService {
  private readonly clock = inject(Clock);
  private readonly backend = inject(Backend);
  private readonly session = inject(SessionService);
  eventsResource(query: Signal<AgendaQuery>) {
    return rxResource({
      params: () => ({
        query: query(),
        user: this.session.user()?.id,
        revision: this.backend.revision(),
      }),
      defaultValue: [] as AgendaEvent[],
      stream: ({ params }) =>
        params.user
          ? remote((signal) =>
              this.backend.client
                .rpc('agenda_read', {
                  p_from: params.query.from,
                  p_to: params.query.to,
                  p_room: params.query.room || undefined,
                  p_professional: params.query.professionalId || undefined,
                })
                .abortSignal(signal),
            ).pipe(map((result) => result as unknown as AgendaEvent[]))
          : of([]),
    });
  }
  nextResource(patientId: Signal<string>) {
    return rxResource({
      params: () => ({
        id: patientId(),
        instant: this.clock.instant(),
        user: this.session.user()?.id,
        revision: this.backend.revision(),
      }),
      defaultValue: null as AgendaEvent | null,
      stream: ({ params }) =>
        params.user
          ? remote((signal) =>
              this.backend.client.rpc('agenda_next', { p_patient: params.id }).abortSignal(signal),
            ).pipe(map((result) => result as unknown as AgendaEvent | null))
          : of(null),
    });
  }
  private readonly audit = inject(AuditService);
  auditResource(id: Signal<string>, cursor?: Signal<string>) {
    return this.audit.resource('agenda', id, cursor);
  }

  async save(
    data: BookingInput,
    mode: BookingEditMode,
    event: AgendaEvent | null,
    operation: string,
  ): Promise<void> {
    await this.backend.command(
      'agenda_command',
      mode,
      { data, id: event?.id, original: event?.original, version: event?.version },
      operation,
    );
    this.backend.refresh();
  }
  async cancel(event: AgendaEvent, future: boolean, operation: string): Promise<void> {
    await this.backend.command(
      'agenda_command',
      future ? 'cancel-future' : 'cancel-one',
      { id: event.id, original: event.original, version: event.version },
      operation,
    );
    this.backend.refresh();
  }
}
