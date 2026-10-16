import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '@core/identity/session.service';
import { Dialog } from '@shared/ui/dialog';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { money } from '@shared/utils/money';
import { formatDate } from '@shared/utils/date';
import { errorMessage } from '@shared/utils/text';
import { SettlementsService } from '../data-access/settlements.service';
import { ExportFilters, exportPayments, selectTransfers } from '../export/payment-export';
import { paymentLabels } from '../domain/settlement-rules';
@Component({
  selector: 'hm-export-dialog',
  imports: [FormsModule, Dialog, ResourceFeedback],
  templateUrl: './export-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportDialog {
  readonly initialMonth = input('');
  readonly initialOwner = input('');
  readonly closed = output<void>();
  readonly session = inject(SessionService);
  private readonly finance = inject(SettlementsService);
  readonly error = signal('');
  readonly downloaded = signal(false);
  readonly filters = signal<ExportFilters>({
    all: false,
    professionalId: '',
    month: '',
    from: '',
    to: '',
    state: '',
  });
  private readonly request = signal<{ month?: string; professionalId?: string } | null>(null);
  readonly resource = this.finance.exportResource(this.request);
  readonly preview = computed(() => {
    if (!this.resource.hasValue() || !this.resource.value())
      return { transfers: [], total: 0, error: '' };
    try {
      const selected = selectTransfers(this.resource.value()!, this.filters());
      return {
        transfers: selected,
        total: selected
          .filter((p) => p.state === 'verified')
          .reduce((n, p) => n + p.amountCents, 0),
        error: '',
      };
    } catch (error) {
      return { transfers: [], total: 0, error: errorMessage(error) };
    }
  });
  readonly states = ['informed', 'observed', 'verified', 'replaced'] as const;
  readonly labels = paymentLabels;
  readonly money = money;
  readonly date = formatDate;
  constructor() {
    effect(() =>
      this.filters.update((f) => ({
        ...f,
        month: this.initialMonth(),
        professionalId: this.initialOwner(),
      })),
    );
  }
  update(patch: Partial<ExportFilters>): void {
    this.filters.update((f) => ({ ...f, ...patch }));
    this.downloaded.set(false);
    this.request.set(null);
  }
  prepare(): void {
    this.error.set('');
    this.downloaded.set(false);
    const f = this.filters();
    try {
      selectTransfers(
        { periods: [], settlements: [], collections: [], transfers: [], audit: [] },
        f,
      );
      this.request.set({
        month: !f.all && f.month ? f.month + '-01' : undefined,
        professionalId: !f.all && f.professionalId ? f.professionalId : undefined,
      });
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  professionalName(id: string): string {
    const s = this.resource.hasValue()
      ? this.resource.value()?.settlements.find((s) => s.id === id)
      : null;
    return this.session.users().find((u) => u.id === s?.professionalId)?.fullName ?? '';
  }
  download(): void {
    try {
      if (
        this.resource.isLoading() ||
        this.resource.error() ||
        !this.resource.hasValue() ||
        !this.resource.value()
      )
        throw new Error('Prepará el informe completo antes de descargar.');
      const blob = exportPayments(this.resource.value()!, this.session.users(), this.filters());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        'Hamacar-pagos-' +
        (this.filters().all ? 'historial' : this.filters().month || 'historial') +
        '.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      this.downloaded.set(true);
      this.error.set('');
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
