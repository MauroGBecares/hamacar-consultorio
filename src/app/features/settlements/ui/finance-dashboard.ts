import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { SessionService } from '@core/identity/session.service';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { formatMonth, shiftMonth } from '@shared/utils/date';
import { money } from '@shared/utils/money';
import { FinanceState } from '../domain/settlement';
import { SettlementsService } from '../data-access/settlements.service';
@Component({
  selector: 'hm-finance-dashboard',
  imports: [ResourceFeedback],
  templateUrl: './finance-dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinanceDashboard {
  readonly state = input.required<FinanceState>();
  readonly cycle = input.required<string>();
  readonly attention = output<string>();
  readonly session = inject(SessionService);
  readonly resource = inject(SettlementsService).dashboardResource(this.cycle);
  readonly data = computed(() => (this.resource.hasValue() ? this.resource.value() : null));
  readonly perspective = signal<'professional' | 'discipline' | 'mode' | 'coverage'>(
    'professional',
  );
  readonly selectedBar = signal('');
  readonly income = computed(() => this.data()?.verifiedCents ?? 0);
  readonly pendingAmount = computed(() => this.data()?.informedCents ?? 0);
  readonly notStarted = computed(() => this.data()?.notStarted ?? 0);
  readonly confirmed = computed(() => this.data()?.confirmed ?? 0);
  readonly chart = computed(() =>
    Array.from({ length: 6 }, (_, i) => {
      const month = shiftMonth(this.cycle() + '-01', i - 5).slice(0, 7);
      return { month, amount: this.data()?.chart.find((x) => x.month === month)?.cents ?? 0 };
    }),
  );
  readonly chartMax = computed(() => Math.max(1, ...this.chart().map((b) => b.amount)));
  readonly alerts = computed(() => [
    {
      key: 'observed',
      count: this.data()?.alerts.observedCount ?? 0,
      label: 'liquidaciones para corregir',
    },
    {
      key: 'informed',
      count: this.data()?.alerts.pendingCount ?? 0,
      label: 'transferencias por revisar',
    },
    {
      key: 'unincluded',
      count: this.data()?.alerts.unincludedCount ?? 0,
      label: 'cobros sin liquidar',
    },
    {
      key: 'uncollected',
      count: this.data()?.alerts.uncollectedCount ?? 0,
      label: 'períodos anteriores sin cobrar',
    },
  ]);
  readonly breakdown = computed(() => this.data()?.details[this.perspective()] ?? []);
  readonly money = money;
  readonly Math = Math;
  readonly month = formatMonth;
}
