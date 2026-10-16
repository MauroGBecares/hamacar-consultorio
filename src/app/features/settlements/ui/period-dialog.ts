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
import { Clock } from '@core/time/clock.service';
import { Operation } from '@core/data-access/backend';
import { Dialog } from '@shared/ui/dialog';
import { formatDate, formatMonth } from '@shared/utils/date';
import { money } from '@shared/utils/money';
import { errorMessage } from '@shared/utils/text';
import { Collection, CollectionInput } from '../domain/settlement';
import { periodStatus } from '../domain/settlement-rules';
import { SettlementsService } from '../data-access/settlements.service';
@Component({
  selector: 'hm-period-dialog',
  imports: [FormsModule, Dialog],
  templateUrl: './period-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodDialog {
  readonly periodId = input.required<string>();
  readonly closed = output<void>();
  readonly session = inject(SessionService);
  readonly service = inject(SettlementsService);
  private readonly civilClock = inject(Clock);
  get today(): string {
    return this.civilClock.today();
  }
  readonly period = computed(() =>
    this.service.workspace().periods.find((p) => p.id === this.periodId()),
  );
  readonly collections = computed(() =>
    this.service.workspace().collections.filter((c) => c.periodId === this.periodId()),
  );
  readonly editable = computed(
    () => !this.session.isPartner() && this.period()?.professionalId === this.session.user()?.id,
  );
  readonly status = computed(() => {
    const p = this.period();
    return p ? periodStatus(this.service.workspace(), p) : '';
  });
  readonly error = signal('');
  readonly pending = signal(false);
  readonly confirmNoService = signal(false);
  readonly correcting = signal<Collection | null>(null);
  readonly correctionAction = signal<{
    kind: 'annul' | 'detach' | 'reopen';
    id: string;
    version: number;
  } | null>(null);
  readonly money = money;
  readonly date = formatDate;
  readonly month = formatMonth;
  private version: number | undefined;
  constructor() {
    effect(() => {
      const p = this.period();
      if (p && this.version === undefined) this.version = p.version;
    });
  }
  private readonly operation = new Operation();
  note = '';
  reason = '';
  form: CollectionInput = {
    date: this.today,
    contribution: '',
    received: '',
    performed: 0,
    sessionsPaid: 1,
    complete: false,
    observation: '',
  };
  canCorrect(c: Collection): boolean {
    return (
      this.editable() &&
      !c.cancelled &&
      !this.service.workspace().transfers.some((t) => t.settlementId === c.settlementId)
    );
  }
  startCorrection(c: Collection): void {
    this.correcting.set(c);
    this.reason = '';
    this.error.set('');
    this.form = {
      date: c.date,
      contribution: (c.contributionCents / 100).toFixed(2).replace('.', ','),
      received:
        c.receivedCents === null ? '' : (c.receivedCents / 100).toFixed(2).replace('.', ','),
      performed: this.period()?.performed ?? 0,
      sessionsPaid: c.sessionsPaid,
      complete: this.period()?.complete ?? false,
      observation: '',
      mode: c.mode,
    };
  }
  private async run(
    kind: string,
    input: unknown,
    command: (operation: string) => Promise<void>,
  ): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    try {
      await command(this.operation.key({ kind, input }));
      this.operation.confirmed();
      this.closed.emit();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
  save(): Promise<void> {
    const correcting = this.correcting();
    return this.run(
      correcting ? 'correct' : 'collection',
      { id: correcting?.id ?? this.periodId(), form: this.form, reason: this.reason },
      (operation) =>
        correcting
          ? this.service.correct(
              correcting.id,
              this.form,
              this.reason,
              operation,
              correcting.version,
            )
          : this.service.addCollection(this.periodId(), this.form, operation, this.version),
    );
  }
  addNote(): Promise<void> {
    return this.run('note', { id: this.periodId(), note: this.note }, (op) =>
      this.service.addPeriodNote(this.periodId(), this.note, op, this.version),
    );
  }
  noService(): Promise<void> {
    return this.run('no-service', { id: this.periodId() }, (op) =>
      this.service.noService(this.periodId(), op, this.version),
    );
  }
  correctState(): Promise<void> {
    const action = this.correctionAction();
    if (!action) return Promise.resolve();
    return this.run(action.kind, { id: action.id, reason: this.reason }, (op) =>
      action.kind === 'reopen'
        ? this.service.reopen(action.id, this.reason, op, action.version)
        : this.service.removeConcept(action.id, action.kind, this.reason, op, action.version),
    );
  }
}
