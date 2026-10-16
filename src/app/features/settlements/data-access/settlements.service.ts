import { AuditService } from '@core/data-access/audit.service';
import { computed, effect, inject, Injectable, signal, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { Backend, json, remote, remoteError, Row } from '@core/data-access/backend';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { LocalAttachment, LocalFileStore } from '@core/files/local-file-store.service';
import { parseMoney } from '@shared/utils/money';
import { AuditEntry } from '@shared/models/audit-entry';
import {
  CollectionInput,
  FinanceState,
  ServicePeriod,
  Settlement,
  Transfer,
  TransferInput,
  emptyFinance,
} from '../domain/settlement';
import {
  periodFromRow,
  settlementFromRow,
  collectionFromRow,
  transferFromRow,
  TransferRow,
} from './finance-mappers';
interface Page<T> {
  items: T[];
  revision: number;
  nextCursor: string | null;
}
interface Scope {
  kind: 'periods' | 'settlements';
  ids: string[];
  revision: number;
  nextCursor: string | null;
}
interface Query {
  month?: string;
  professionalId?: string;
  slots?: boolean;
  scope?: Scope;
}
export interface FinanceSummary {
  verifiedCents: number;
  informedCents: number;
  observedCents: number;
  pendingCount: number;
  byProfessional: { professional_id: string; full_name: string; cents: number }[];
  byMonth: { month: string; cents: number }[];
}
export interface HomeSummary {
  pendingCount: number;
  observedCount: number;
  unincludedCount: number;
  uncollectedCount: number;
  status: string;
}
export interface Dashboard extends FinanceSummary {
  chart: { month: string; cents: number }[];
  details: Partial<Record<'professional' | 'discipline' | 'mode' | 'coverage', [string, number][]>>;
  alerts: HomeSummary;
  notStarted: number;
  confirmed: number;
}
@Injectable({ providedIn: 'root' })
export class SettlementsService {
  private readonly backend = inject(Backend);
  private readonly session = inject(SessionService);
  private readonly clock = inject(Clock);
  private readonly files = inject(LocalFileStore);
  readonly cycle = signal(this.clock.today().slice(0, 7));
  readonly owner = signal('');
  readonly browsing = signal({ history: false, attention: '', cursor: '', status: 'Todas' });
  readonly scope = signal<Scope | null>(null);
  private readonly slotIds = new Map<string, string>();
  private readonly receipts = new Map<File, LocalAttachment>();
  readonly workspaceResource = rxResource({
    params: () => ({
      user: this.session.user()?.id,
      users: this.session.users(),
      revision: this.backend.revision(),
      month: this.cycle(),
      owner: this.owner(),
      browsing: this.browsing(),
    }),
    defaultValue: emptyFinance(),
    stream: ({ params }) =>
      params.user
        ? remote(async (signal) => {
            let scope: Scope | undefined;
            if (params.browsing.history || params.browsing.attention) {
              const result = await this.backend.client
                .rpc('finance_scope', {
                  p_query: json({
                    month: params.month + '-01',
                    professionalId: params.owner,
                    ...params.browsing,
                  }),
                })
                .abortSignal(signal);
              if (result.error) throw remoteError(result.error);
              scope = result.data as unknown as Scope;
            }
            const data = await this.readFinance(
              scope
                ? { scope, professionalId: params.owner || undefined }
                : {
                    month: params.month + '-01',
                    professionalId: params.owner || undefined,
                    slots: true,
                  },
              signal,
            );
            if (!signal.aborted) this.scope.set(scope ?? null);
            return { data, error: null };
          })
        : of(emptyFinance()),
  });
  private readonly snapshot = signal<FinanceState>(emptyFinance());
  readonly workspace = computed(() =>
    this.session.user() || this.session.locked() ? this.snapshot() : emptyFinance(),
  );
  constructor() {
    effect(() => {
      if (
        this.session.user() &&
        !this.workspaceResource.isLoading() &&
        !this.workspaceResource.error()
      )
        this.snapshot.set(this.workspaceResource.value());
    });
    window.addEventListener('hamacar:identity-change', () => {
      this.snapshot.set(emptyFinance());
      this.slotIds.clear();
      this.receipts.clear();
    });
    window.addEventListener('hamacar:lock', () => this.receipts.clear());
  }
  openCycle(month: string, owner = ''): void {
    this.cycle.set(month);
    this.owner.set(owner);
  }
  dashboardResource(month: Signal<string>) {
    return rxResource({
      params: () => ({
        month: month(),
        user: this.session.user()?.id,
        revision: this.backend.revision(),
      }),
      defaultValue: null as Dashboard | null,
      stream: ({ params }) =>
        params.user
          ? remote((signal) =>
              this.backend.client
                .rpc('finance_dashboard', { p_month: params.month + '-01' })
                .abortSignal(signal),
            ).pipe(map((result) => result as unknown as Dashboard))
          : of(null),
    });
  }
  homeResource(month: Signal<string>) {
    return rxResource({
      params: () => ({
        month: month(),
        user: this.session.user()?.id,
        revision: this.backend.revision(),
      }),
      defaultValue: null as HomeSummary | null,
      stream: ({ params }) =>
        params.user
          ? remote((signal) =>
              this.backend.client
                .rpc('home_summary', { p_month: params.month + '-01' })
                .abortSignal(signal),
            ).pipe(map((result) => result as unknown as HomeSummary))
          : of(null),
    });
  }
  summaryResource(from: Signal<string>, to: Signal<string>, owner: Signal<string>) {
    return rxResource({
      params: () => ({
        from: from(),
        to: to(),
        owner: owner(),
        user: this.session.user()?.id,
        revision: this.backend.revision(),
      }),
      defaultValue: null as FinanceSummary | null,
      stream: ({ params }) =>
        params.user
          ? remote((signal) =>
              this.backend.client
                .rpc('finance_summary', {
                  p_from: params.from,
                  p_to: params.to,
                  p_professional: params.owner || undefined,
                })
                .abortSignal(signal),
            ).pipe(map((result) => result as unknown as FinanceSummary))
          : of(null),
    });
  }
  exportResource(query: Signal<Query | null>) {
    return rxResource({
      params: () => ({ query: query(), user: this.session.user()?.id }),
      defaultValue: null as FinanceState | null,
      stream: ({ params }) =>
        params.user && params.query
          ? remote(async (signal) => {
              this.session.requirePartner();
              return { data: await this.readFinance(params.query!, signal), error: null };
            })
          : of(null),
    });
  }
  private readonly audit = inject(AuditService);
  auditResource(id: Signal<string>, cursor?: Signal<string>) {
    return this.audit.resource('finance', id, cursor);
  }

  private async readFinance(query: Query, signal: AbortSignal): Promise<FinanceState> {
    const db = this.backend.client;
    let revision: number | undefined = query.scope?.revision;
    const all = async <T>(entity: string, target?: string): Promise<T[]> => {
      const rows: T[] = [];
      let cursor: string | null = null;
      do {
        const { data, error } = await db
          .rpc('finance_page', {
            p_query: json({
              entity,
              scope: target ? undefined : query.scope,
              month: target ? undefined : query.month,
              professionalId: query.professionalId,
              target,
              cursor,
              revision,
              limit: 50,
            }),
          })
          .abortSignal(signal);
        if (error) throw remoteError(error);
        const page = data as unknown as Page<T>;
        revision ??= page.revision;
        rows.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && !signal.aborted);
      if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
      return rows;
    };
    const periods = await all<Row<'service_periods'>>('periods');
    const settlements = await all<Row<'settlements'>>('settlements');
    const collections = await all<Row<'collections'>>('collections');
    const payments = await all<TransferRow>('transfers');
    const initialSettlements = new Set(settlements.map((s) => s.id));
    const missingSettlements = [
      ...new Set(
        collections
          .map((c) => c.settlement_id)
          .filter((id): id is string => !!id && !initialSettlements.has(id)),
      ),
    ];
    for (let start = 0; start < missingSettlements.length; start += 200) {
      const { data, error } = await db
        .from('settlements')
        .select('*')
        .in('id', missingSettlements.slice(start, start + 200))
        .abortSignal(signal);
      if (error) throw remoteError(error);
      settlements.push(...data);
    }
    for (const id of missingSettlements) {
      payments.push(...(await all<TransferRow>('transfers', id)));
      collections.push(...(await all<Row<'collections'>>('collections', id)));
    }
    const uniqueCollections = [...new Map(collections.map((c) => [c.id, c])).values()];
    const knownPeriods = new Set(periods.map((p) => p.id));
    const missingPeriods = [
      ...new Set(uniqueCollections.map((c) => c.period_id).filter((id) => !knownPeriods.has(id))),
    ];
    for (let start = 0; start < missingPeriods.length; start += 200) {
      const { data, error } = await db
        .from('service_periods')
        .select('*')
        .in('id', missingPeriods.slice(start, start + 200))
        .abortSignal(signal);
      if (error) throw remoteError(error);
      periods.push(...data);
    }
    const state: FinanceState = {
      periods: periods.map(periodFromRow),
      settlements: settlements.map(settlementFromRow),
      collections: uniqueCollections.map(collectionFromRow),
      transfers: [...new Map(payments.map((p) => [p.id, p])).values()].map(transferFromRow),
      audit: [],
    };
    if (query.slots && query.month) {
      let cursor: string | undefined;
      do {
        const { data, error } = await db
          .rpc('finance_slots', {
            p_month: query.month,
            p_professional: query.professionalId,
            p_cursor: cursor,
            p_limit: 50,
          })
          .abortSignal(signal);
        if (error) throw remoteError(error);
        const slots = data as unknown as (Row<'service_periods'> & { persisted: false })[];
        state.periods.push(...slots.map(periodFromRow));
        cursor = slots.length === 50 ? slots.at(-1)!.id : undefined;
      } while (cursor && !signal.aborted);
      for (const user of this.session
        .billingUsers()
        .filter((u) => u.active && (!query.professionalId || u.id === query.professionalId))) {
        if (!this.session.isPartner() && user.id !== this.session.user()?.id) continue;
        if (
          state.settlements.some(
            (s) => s.professionalId === user.id && s.month === query.month!.slice(0, 7),
          )
        )
          continue;
        const key = user.id + ':' + query.month;
        const id = this.slotIds.get(key) ?? crypto.randomUUID();
        this.slotIds.set(key, id);
        state.settlements.push({
          id,
          professionalId: user.id,
          month: query.month.slice(0, 7),
          notes: [],
          version: 1,
          persisted: false,
        });
      }
    }
    const { error } = await db
      .rpc('finance_page', { p_query: json({ entity: 'periods', limit: 1, revision }) })
      .abortSignal(signal);
    if (error) throw remoteError(error);
    if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
    return state;
  }
  private period(id: string): ServicePeriod {
    const p = this.workspace().periods.find((p) => p.id === id);
    if (!p) throw new Error('Esperá a que se cargue el período.');
    return p;
  }
  private settlement(id: string): Settlement {
    const s = this.workspace().settlements.find((s) => s.id === id);
    if (!s) throw new Error('Esperá a que se cargue la liquidación.');
    return s;
  }
  private async command(
    action: string,
    input: unknown,
    operation: string,
  ): Promise<{ id: string; version: number }> {
    const result = (await this.backend.command('finance_command', action, input, operation)) as {
      id: string;
      version: number;
    };
    this.backend.refresh();
    return result;
  }
  private periodInput(p: ServicePeriod, version = p.version) {
    return {
      id: p.persisted === false ? null : p.id,
      patientId: p.patientId,
      month: p.month + '-01',
      version,
    };
  }
  async addCollection(
    id: string,
    input: CollectionInput,
    operation: string,
    version?: number,
  ): Promise<void> {
    const p = this.period(id);
    const mode = p.mode ?? input.mode;
    await this.command(
      'collection',
      {
        ...this.periodInput(p, version),
        ...input,
        mode,
        contributionCents: parseMoney(input.contribution),
        receivedCents: mode === 'Cobertura' ? parseMoney(input.received) : null,
      },
      operation,
    );
  }
  async noService(id: string, operation: string, version?: number): Promise<void> {
    await this.command('no-service', this.periodInput(this.period(id), version), operation);
  }
  async reopen(id: string, reason: string, operation: string, version?: number): Promise<void> {
    await this.command(
      'reopen',
      { ...this.periodInput(this.period(id), version), reason },
      operation,
    );
  }
  async addPeriodNote(
    id: string,
    observation: string,
    operation: string,
    version?: number,
  ): Promise<void> {
    await this.command(
      'period-note',
      { ...this.periodInput(this.period(id), version), observation },
      operation,
    );
  }
  async correct(
    id: string,
    input: CollectionInput,
    reason: string,
    operation: string,
    version?: number,
  ): Promise<void> {
    const c = this.workspace().collections.find((c) => c.id === id);
    if (!c) throw new Error('Cobro no disponible.');
    await this.command(
      'correct',
      {
        id,
        version: version ?? c.version,
        ...input,
        reason,
        contributionCents: parseMoney(input.contribution),
        receivedCents: c.mode === 'Cobertura' ? parseMoney(input.received) : null,
      },
      operation,
    );
  }
  async removeConcept(
    id: string,
    action: 'annul' | 'detach',
    reason: string,
    operation: string,
    version?: number,
  ): Promise<void> {
    const c = this.workspace().collections.find((c) => c.id === id);
    if (!c) throw new Error('Cobro no disponible.');
    await this.command(action, { id, version: version ?? c.version, reason }, operation);
  }
  async prepare(
    id: string,
    collectionIds: string[],
    observation: string,
    operation: string,
    version?: number,
  ): Promise<{ id: string; version: number }> {
    const s = this.settlement(id);
    return await this.command(
      'prepare',
      {
        id: s.persisted === false ? null : s.id,
        month: s.month + '-01',
        version: version ?? s.version,
        collectionIds,
        observation,
      },
      operation,
    );
  }
  async sendTransfer(
    id: string,
    input: TransferInput,
    operation: string,
    version?: number,
  ): Promise<void> {
    const s = this.settlement(id);
    if (s.persisted === false) throw new Error('Incluí al menos un concepto antes de transferir.');
    if (!input.receipt) throw new Error('Adjuntá el comprobante.');
    let receipt = this.receipts.get(input.receipt);
    if (!receipt) {
      receipt = this.files.add(input.receipt, 'receipt');
      this.receipts.set(input.receipt, receipt);
    }
    const uploaded = await this.files.upload(receipt, { purpose: 'receipt', settlementId: id });
    const old = this.workspace().transfers.find((t) => t.id === input.replacesId);
    await this.command(
      'transfer',
      {
        id,
        version: version ?? s.version,
        date: input.date,
        amountCents: parseMoney(input.amount),
        observation: input.observation,
        receiptId: uploaded.id,
        replacesId: old?.id,
        replacesVersion: old?.version,
      },
      operation,
    );
    this.files.remove(receipt.id);
    this.receipts.delete(input.receipt);
  }
  releaseReceipt(file: File | null): void {
    if (!file) return;
    const receipt = this.receipts.get(file);
    if (receipt) this.files.remove(receipt.id);
    this.receipts.delete(file);
  }
  async verify(id: string, operation: string, version?: number): Promise<void> {
    const t = this.workspace().transfers.find((t) => t.id === id);
    await this.command('verify', { id, version: version ?? t?.version }, operation);
  }
  async observe(id: string, reason: string, operation: string, version?: number): Promise<void> {
    const t = this.workspace().transfers.find((t) => t.id === id);
    await this.command('observe', { id, version: version ?? t?.version, reason }, operation);
  }
  receipt(transfer: Transfer): LocalAttachment {
    return transfer.receipt;
  }
}
