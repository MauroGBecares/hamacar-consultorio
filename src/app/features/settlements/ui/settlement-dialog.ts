import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  DestroyRef,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { Dialog } from '@shared/ui/dialog';
import { AttachmentList } from '@shared/ui/attachment-list';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { Operation } from '@core/data-access/backend';
import { formatDate, formatMonth, dueDate } from '@shared/utils/date';
import { money } from '@shared/utils/money';
import { errorMessage } from '@shared/utils/text';
import { SettlementsService } from '../data-access/settlements.service';
import { TransferInput } from '../domain/settlement';
import {
  concepts,
  paid,
  paymentLabels,
  reported,
  settlementStatus,
  total,
  transfers,
} from '../domain/settlement-rules';

@Component({
  selector: 'hm-settlement-dialog',
  imports: [FormsModule, Dialog, AttachmentList, ResourceFeedback],
  templateUrl: './settlement-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettlementDialog {
  readonly settlementId = input.required<string>();
  readonly activeId = signal('');
  readonly resolvedId = computed(() => this.activeId() || this.settlementId());
  readonly pending = signal(false);
  private readonly operation = new Operation();
  readonly initialStep = input<'detail' | 'review'>('detail');
  readonly closed = output<void>();
  readonly historyRequested = output<string>();
  readonly service = inject(SettlementsService);
  readonly session = inject(SessionService);
  private readonly civilClock = inject(Clock);
  get today(): string {
    return this.civilClock.today();
  }
  readonly step = signal<'detail' | 'review' | 'transfer'>('detail');
  readonly error = signal('');
  readonly action = signal<{
    type: 'verify' | 'observe';
    transferId: string;
    version: number;
  } | null>(null);
  readonly selected = signal<string[]>([]);
  readonly settlement = computed(() =>
    this.service.workspace().settlements.find((s) => s.id === this.resolvedId()),
  );
  readonly entries = computed(() => concepts(this.service.workspace(), this.resolvedId()));
  readonly payments = computed(() => transfers(this.service.workspace(), this.resolvedId()));
  readonly status = computed(() => {
    const settlement = this.settlement();
    return settlement ? settlementStatus(this.service.workspace(), settlement) : '';
  });
  readonly editable = computed(
    () =>
      !this.session.isPartner() && this.settlement()?.professionalId === this.session.user()?.id,
  );
  readonly options = computed(() =>
    this.service
      .workspace()
      .collections.filter(
        (c) =>
          c.professionalId === this.settlement()?.professionalId &&
          !c.settlementId &&
          !c.cancelled &&
          c.date.slice(0, 7) <= (this.settlement()?.month ?? ''),
      ),
  );
  readonly total = computed(() => total(this.service.workspace(), this.resolvedId()));
  readonly paid = computed(() => paid(this.service.workspace(), this.resolvedId()));
  readonly reported = computed(() => reported(this.service.workspace(), this.resolvedId()));
  readonly reviewTotal = computed(
    () =>
      this.total() +
      this.options()
        .filter((c) => this.selected().includes(c.id))
        .reduce((sum, c) => sum + c.contributionCents, 0),
  );
  readonly auditCursor = signal('');
  readonly auditHistory = signal<string[]>([]);
  auditNext(id: string): void {
    this.auditHistory.update((h) => [...h, this.auditCursor()]);
    this.auditCursor.set(id);
  }
  auditPrevious(): void {
    const h = this.auditHistory();
    this.auditCursor.set(h.at(-1) ?? '');
    this.auditHistory.set(h.slice(0, -1));
  }
  readonly auditResource = this.service.auditResource(this.resolvedId, this.auditCursor);
  readonly audit = computed(() =>
    this.auditResource.hasValue() ? this.auditResource.value() : [],
  );
  readonly actionTransfer = computed(() =>
    this.payments().find((p) => p.id === this.action()?.transferId),
  );
  readonly money = money;
  readonly date = formatDate;
  readonly month = formatMonth;
  readonly due = dueDate;
  readonly paymentLabels = paymentLabels;
  observation = '';
  reason = '';
  private initialized = false;
  private version: number | undefined;
  private readonly receiptFiles = new Set<File>();
  transfer: TransferInput = { date: this.today, amount: '', receipt: null, observation: '' };
  constructor() {
    const lock = () => {
      for (const file of this.receiptFiles) this.service.releaseReceipt(file);
      this.receiptFiles.clear();
      this.transfer.receipt = null;
    };
    window.addEventListener('hamacar:lock', lock);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('hamacar:lock', lock);
      for (const file of this.receiptFiles) this.service.releaseReceipt(file);
      this.receiptFiles.clear();
      this.transfer.receipt = null;
    });
    effect(() => {
      if (this.initialized || !this.settlement()) return;
      this.initialized = true;
      this.version = this.settlement()?.version;
      if (this.initialStep() === 'review' && this.editable() && !this.payments().length) {
        this.selected.set(this.options().map((c) => c.id));
        this.step.set('review');
      }
    });
  }
  periodMonth(periodId: string): string {
    return this.service.workspace().periods.find((p) => p.id === periodId)?.month ?? '';
  }
  toggle(id: string): void {
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }
  review(): void {
    this.version = this.settlement()?.version;
    this.error.set('');
    this.selected.set(this.options().map((c) => c.id));
    this.step.set('review');
  }
  async prepare(): Promise<void> {
    if (this.pending()) return;
    if (!this.selected().length && this.entries().length) {
      this.startTransfer();
      return;
    }
    this.pending.set(true);
    try {
      const payload = {
        id: this.resolvedId(),
        ids: this.selected(),
        observation: this.observation,
      };
      const result = await this.service.prepare(
        this.resolvedId(),
        this.selected(),
        this.observation,
        this.operation.key(payload),
        this.version,
      );
      this.operation.confirmed();
      this.activeId.set(result.id);
      this.version = result.version;
      this.step.set('transfer');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
  startTransfer(replacesId?: string): void {
    this.version = this.settlement()?.version;
    if (!this.entries().length) {
      this.error.set('Incluí al menos un concepto antes de transferir.');
      return;
    }
    const observed = replacesId ?? this.payments().find((t) => t.state === 'observed')?.id;
    this.transfer = {
      date: this.today,
      amount: '',
      receipt: null,
      observation: '',
      replacesId: observed,
    };
    this.error.set('');
    this.step.set('transfer');
  }
  async sendTransfer(): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    if (this.transfer.receipt) this.receiptFiles.add(this.transfer.receipt);
    try {
      const payload = {
        id: this.resolvedId(),
        ...this.transfer,
        file: this.transfer.receipt
          ? {
              name: this.transfer.receipt.name,
              size: this.transfer.receipt.size,
              modified: this.transfer.receipt.lastModified,
            }
          : null,
      };
      await this.service.sendTransfer(
        this.resolvedId(),
        this.transfer,
        this.operation.key(payload),
        this.version,
      );
      this.operation.confirmed();
      this.step.set('detail');
      this.error.set('');
      this.transfer.receipt = null;
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
  async reviewPayment(): Promise<void> {
    const action = this.action();
    if (!action || this.pending()) return;
    this.pending.set(true);
    try {
      const operation = this.operation.key({ action, reason: this.reason });
      if (action.type === 'verify')
        await this.service.verify(action.transferId, operation, action.version);
      else await this.service.observe(action.transferId, this.reason, operation, action.version);
      this.operation.confirmed();
      this.action.set(null);
      this.reason = '';
      this.error.set('');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
