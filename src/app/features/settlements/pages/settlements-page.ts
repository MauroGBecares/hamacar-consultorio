import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { PatientsService } from '@features/patients/public-api';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { formatDate, formatMonth, dueDate, validMonth } from '@shared/utils/date';
import { money } from '@shared/utils/money';
import { SettlementsService } from '../data-access/settlements.service';
import { ServicePeriod, Settlement } from '../domain/settlement';
import { periodStatus, settlementStatus, total, transfers } from '../domain/settlement-rules';
import { FinanceDashboard } from '../ui/finance-dashboard';
import { PeriodDialog } from '../ui/period-dialog';
import { SettlementDialog } from '../ui/settlement-dialog';
import { ExportDialog } from '../ui/export-dialog';

@Component({
  selector: 'hm-settlements-page',
  imports: [
    FormsModule,
    ResourceFeedback,
    FinanceDashboard,
    PeriodDialog,
    SettlementDialog,
    ExportDialog,
  ],
  templateUrl: './settlements-page.html',
  styleUrl: './settlements-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettlementsPage {
  readonly service = inject(SettlementsService);
  readonly session = inject(SessionService);
  private readonly patients = inject(PatientsService);
  private readonly today = inject(Clock).today();
  private readonly route = inject(ActivatedRoute);
  readonly cycle = signal(this.today.slice(0, 7));
  readonly owner = signal('');
  readonly tab = signal('Resumen');
  readonly attention = signal(this.route.snapshot.queryParamMap.get('attention') ?? '');
  readonly statusFilter = signal('Todas');
  readonly selectedPeriod = signal('');
  readonly selectedSettlement = signal<{ id: string; step: 'detail' | 'review' } | null>(null);
  readonly exporting = signal(false);
  readonly state = this.service.workspace;
  readonly pageIndex = signal(0);
  readonly cursors = signal<string[]>(['']);
  readonly scoped = computed(() => !!this.attention() || this.tab() === 'Historial');
  readonly visibleBills = computed(() =>
    this.scoped()
      ? this.bills()
      : this.bills().slice(this.pageIndex() * 50, (this.pageIndex() + 1) * 50),
  );
  readonly visiblePeriods = computed(() =>
    this.periods().slice(
      this.scoped() ? 0 : this.pageIndex() * 50,
      this.scoped() ? 50 : (this.pageIndex() + 1) * 50,
    ),
  );
  readonly hasNext = computed(() =>
    this.scoped()
      ? !!this.service.scope()?.nextCursor
      : (this.tab() === 'Control de períodos'
          ? this.periods()
          : this.tab() === 'Resumen' && this.selectedOwner()
            ? this.currentPeriods()
            : this.bills()
        ).length >
        (this.pageIndex() + 1) * 50,
  );
  next(): void {
    const cursor = this.service.scope()?.nextCursor;
    if (this.scoped() && cursor)
      this.cursors.update((values) => [...values.slice(0, this.pageIndex() + 1), cursor]);
    this.pageIndex.update((n) => n + 1);
  }
  previous(): void {
    this.pageIndex.update((n) => Math.max(0, n - 1));
  }
  readonly tabs = computed(() =>
    this.session.isPartner() && !this.owner()
      ? ['Resumen', 'Control de períodos', 'Profesionales', 'Historial']
      : ['Resumen', 'Control de períodos', 'Historial'],
  );
  readonly selectedOwner = computed(() =>
    this.session.isPartner() ? this.owner() : (this.session.user()?.id ?? ''),
  );
  readonly personal = computed(() =>
    this.state().settlements.find(
      (s) => s.professionalId === this.selectedOwner() && s.month === this.cycle(),
    ),
  );
  readonly pendingConcepts = computed(() =>
    this.state().collections.filter(
      (c) =>
        c.professionalId === this.selectedOwner() &&
        !c.settlementId &&
        !c.cancelled &&
        c.date.slice(0, 7) <= this.cycle(),
    ),
  );
  readonly currentPeriods = computed(() =>
    this.state().periods.filter(
      (p) => p.professionalId === this.selectedOwner() && p.month === this.cycle(),
    ),
  );
  readonly visibleCurrentPeriods = computed(() =>
    this.currentPeriods().slice(this.pageIndex() * 50, (this.pageIndex() + 1) * 50),
  );
  readonly bills = computed(() =>
    this.state()
      .settlements.filter((s) => {
        if (this.selectedOwner() && s.professionalId !== this.selectedOwner()) return false;
        if (this.scoped() && !this.service.scope()?.ids.includes(s.id)) return false;
        if (this.attention() === 'observed' && this.status(s) !== 'Para corregir') return false;
        if (
          this.attention() === 'informed' &&
          !transfers(this.state(), s.id).some((t) => t.state === 'informed')
        )
          return false;
        if (
          !this.attention() &&
          (this.tab() === 'Historial' ? s.month > this.cycle() : s.month !== this.cycle())
        )
          return false;
        if (this.statusFilter() === 'Confirmadas') return this.status(s) === 'Confirmado';
        if (this.statusFilter() === 'Pendientes') return this.status(s) !== 'Confirmado';
        if (this.statusFilter() === 'Para corregir') return this.status(s) === 'Para corregir';
        return true;
      })
      .toSorted(
        (a, b) =>
          b.month.localeCompare(a.month) || a.professionalId.localeCompare(b.professionalId),
      ),
  );
  readonly periods = computed(() =>
    this.state()
      .periods.filter(
        (p) =>
          (!this.selectedOwner() || p.professionalId === this.selectedOwner()) &&
          (!this.scoped() || this.service.scope()?.ids.includes(p.id)) &&
          (this.attention() || p.month === this.cycle()) &&
          (this.attention() === 'uncollected'
            ? p.declared && !p.complete && p.month < this.cycle()
            : this.attention() === 'unincluded'
              ? this.state().collections.some((c) => c.periodId === p.id && !c.settlementId)
              : true),
      )
      .toSorted(
        (a, b) =>
          a.professionalId.localeCompare(b.professionalId) ||
          a.patientId.localeCompare(b.patientId) ||
          a.month.localeCompare(b.month),
      ),
  );
  readonly periodGroups = computed(() => {
    const groups = new Map<
      string,
      { professionalId: string; patientName: string; periods: ServicePeriod[] }
    >();
    for (const period of this.visiblePeriods()) {
      const key = `${period.professionalId}:${period.patientId}`;
      const group = groups.get(key) ?? {
        professionalId: period.professionalId,
        patientName: period.patientName,
        periods: [],
      };
      group.periods.push(period);
      groups.set(key, group);
    }
    return [...groups.entries()];
  });
  readonly money = money;
  readonly month = formatMonth;
  readonly date = formatDate;
  readonly due = dueDate;
  constructor() {
    effect(() => {
      this.cycle();
      this.selectedOwner();
      this.attention();
      this.tab();
      this.statusFilter();
      untracked(() => {
        this.pageIndex.set(0);
        this.cursors.set(['']);
      });
    });
    effect(() => {
      const cycle = this.cycle();
      const owner = this.selectedOwner();
      const browsing = {
        history: this.tab() === 'Historial',
        attention: this.attention(),
        status: this.statusFilter(),
        cursor: this.cursors()[this.pageIndex()] ?? '',
      };
      untracked(() => {
        this.service.openCycle(cycle, owner);
        this.service.browsing.set(browsing);
      });
    });
    if (this.attention())
      this.tab.set(
        ['uncollected', 'unincluded'].includes(this.attention())
          ? 'Control de períodos'
          : 'Profesionales',
      );
  }
  setCycle(value: string): void {
    if (validMonth(value)) {
      this.cycle.set(value);
      this.attention.set('');
    }
  }
  setTab(tab: string): void {
    this.tab.set(tab);
    this.attention.set('');
    this.statusFilter.set('Todas');
  }
  status(settlement: Settlement): string {
    return settlementStatus(this.state(), settlement);
  }
  periodStatus(period: ServicePeriod): string {
    return periodStatus(this.state(), period);
  }
  total(settlement: Settlement): number {
    return total(this.state(), settlement.id);
  }
  alert(key: string): void {
    this.attention.set(key);
    this.owner.set('');
    this.statusFilter.set('Todas');
    this.tab.set(
      ['unincluded', 'uncollected'].includes(key) ? 'Control de períodos' : 'Profesionales',
    );
  }
  openHistory(id: string): void {
    this.selectedSettlement.set(null);
    this.owner.set(id);
    this.setTab('Historial');
  }
}
