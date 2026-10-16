import { AuditService } from '@core/data-access/audit.service';
import { computed, inject, Injectable, signal, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { Backend, json, remote, Row } from '@core/data-access/backend';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { AuditEntry } from '@shared/models/audit-entry';
import { Patient, PatientData, PatientIdentity, PatientStatus } from '../domain/patient';
import { validatePatient } from '../domain/patient-rules';
export interface Duplicate {
  accessible: boolean;
  id?: string;
  name?: string;
}
function patient(row: Row<'patients'> & { patient_team: { professional_id: string }[] }): Patient {
  return {
    ...(row.data as unknown as PatientData),
    id: row.id,
    version: row.version,
    name: row.name,
    birthDate: row.birth_date ?? '',
    admission: row.admission,
    status: row.status as PatientStatus,
    professionalIds: row.patient_team.map((t) => t.professional_id),
    closedAt: row.closed_at ?? undefined,
    closeReason: row.close_reason ?? undefined,
  };
}
@Injectable({ providedIn: 'root' })
export class PatientsService {
  private readonly session = inject(SessionService);
  private readonly backend = inject(Backend);
  private readonly clock = inject(Clock);
  readonly query = signal('');
  readonly cursor = signal('');
  readonly status = signal('');
  readonly mine = signal(false);
  readonly patientsResource = rxResource({
    params: () => ({
      user: this.session.user()?.id,
      revision: this.backend.revision(),
      query: this.query(),
      cursor: this.cursor(),
      status: this.status(),
      mine: this.mine(),
    }),
    defaultValue: [] as Patient[],
    stream: ({ params }) => {
      if (!params.user) return of([]);
      return remote((signal) =>
        this.backend.client
          .rpc('patient_page', {
            p_query: json({
              search: params.query,
              cursor: params.cursor,
              status: params.status,
              professionalId: params.mine ? params.user : null,
            }),
          })
          .abortSignal(signal),
      ).pipe(
        map((result) =>
          (result as unknown as { items: Parameters<typeof patient>[0][] }).items.map(patient),
        ),
      );
    },
  });
  readonly patients = computed(() =>
    this.session.user() && this.patientsResource.hasValue() ? this.patientsResource.value() : [],
  );
  directoryResource(
    query: Signal<{ search?: string; professionalId?: string; cursor?: string; status?: string }>,
  ) {
    return rxResource({
      params: () => ({
        query: query(),
        user: this.session.user()?.id,
        revision: this.backend.revision(),
      }),
      defaultValue: [] as Patient[],
      stream: ({ params }) =>
        params.user
          ? remote((signal) =>
              this.backend.client
                .rpc('patient_page', { p_query: json(params.query) })
                .abortSignal(signal),
            ).pipe(
              map((result) =>
                (result as unknown as { items: Parameters<typeof patient>[0][] }).items.map(
                  patient,
                ),
              ),
            )
          : of([]),
    });
  }
  detailResource(id: Signal<string>) {
    return rxResource({
      params: () => ({
        id: id(),
        user: this.session.user()?.id,
        revision: this.backend.revision(),
      }),
      defaultValue: null as Patient | null,
      stream: ({ params }) =>
        params.user
          ? remote((signal) =>
              this.backend.client
                .from('patients')
                .select('*, patient_team(professional_id)')
                .eq('id', params.id)
                .abortSignal(signal)
                .maybeSingle(),
            ).pipe(map((row) => (row ? patient(row) : null)))
          : of(null),
    });
  }
  private readonly audit = inject(AuditService);
  auditResource(id: Signal<string>, cursor?: Signal<string>) {
    return this.audit.resource('patients', id, cursor);
  }

  duplicateResource(name: Signal<string>, except: Signal<string>) {
    return rxResource({
      params: () => ({ name: name(), except: except(), user: this.session.user()?.id }),
      defaultValue: [] as Duplicate[],
      stream: ({ params }) =>
        params.user && params.name.trim().length >= 3
          ? remote((signal) =>
              this.backend.client
                .rpc('patient_duplicates', {
                  p_name: params.name,
                  p_except: params.except || undefined,
                })
                .abortSignal(signal),
            ).pipe(map((result) => result as unknown as Duplicate[]))
          : of([]),
    });
  }
  canAccess(id: string): boolean {
    return this.patients().some((p) => p.id === id);
  }
  requireAccess(id: string, writable = false): Patient {
    const p = this.patients().find((p) => p.id === id);
    if (!p) throw new Error('Paciente no disponible.');
    if (writable && p.status === 'Archivado') throw new Error('Reactivá el paciente.');
    return p;
  }
  assignedIdentities(id: string): PatientIdentity[] {
    return this.patients().filter((p) => p.professionalIds.includes(id));
  }
  identity(id: string): PatientIdentity {
    return this.requireAccess(id);
  }
  async save(
    data: PatientData,
    id: string | undefined,
    duplicateAcknowledged: boolean,
    version: number,
    operation: string,
  ): Promise<string> {
    const clean = Object.fromEntries(
      Object.keys(data)
        .filter((key) => key !== 'version')
        .map((key) => [key, String(data[key as keyof PatientData]).trim()]),
    ) as unknown as PatientData;
    validatePatient(clean, this.clock.today());
    const result = (await this.backend.command(
      'patient_command',
      'save',
      { id: id || null, data: clean, duplicateAcknowledged, version },
      operation,
    )) as { id: string };
    this.backend.refresh();
    return result.id;
  }
  async manage(
    id: string,
    professionalIds: string[],
    status: PatientStatus,
    reason: string,
    version: number,
    operation: string,
  ): Promise<void> {
    await this.backend.command(
      'patient_command',
      'manage',
      { id, professionalIds, status, reason, version },
      operation,
    );
    this.backend.refresh();
  }
}
