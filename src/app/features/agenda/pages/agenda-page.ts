import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { Dialog } from '@shared/ui/dialog';
import {
  addDays,
  dayNumber,
  formatDate,
  formatMonth,
  shiftMonth,
  validDate,
  weekStart,
} from '@shared/utils/date';
import { errorMessage } from '@shared/utils/text';
import { AgendaService } from '../data-access/agenda.service';
import { AgendaEvent, BookingEditMode } from '../domain/booking';
import { frequency } from '../domain/recurrence';
import { BookingEditor } from '../ui/booking-editor';
import { Operation } from '@core/data-access/backend';

@Component({
  selector: 'hm-agenda-page',
  imports: [FormsModule, ResourceFeedback, Dialog, BookingEditor],
  templateUrl: './agenda-page.html',
  styleUrl: './agenda-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaPage {
  readonly session = inject(SessionService);
  readonly agenda = inject(AgendaService);
  private readonly civilClock = inject(Clock);
  get today(): string {
    return this.civilClock.today();
  }
  private readonly queryDate = inject(ActivatedRoute).snapshot.queryParamMap.get('date');
  readonly selectedDay = signal(
    this.queryDate && validDate(this.queryDate) ? this.queryDate : this.today,
  );
  readonly layout = signal<'day' | 'week' | 'month'>('day');
  readonly roomFilter = signal(0);
  readonly userFilter = signal('');
  readonly detail = signal<AgendaEvent | null>(null);
  readonly editing = signal<{
    mode: BookingEditMode;
    event: AgendaEvent | null;
    room: number;
  } | null>(null);
  readonly cancelling = signal<'one' | 'future' | null>(null);
  readonly error = signal('');
  readonly pending = signal(false);
  private readonly operation = new Operation();
  private readonly clock = inject(Clock);
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
  readonly auditResource = this.agenda.auditResource(
    computed(() => this.detail()?.id ?? ''),
    this.auditCursor,
  );
  canEdit(event: AgendaEvent): boolean {
    return (
      event.editable &&
      Date.parse(event.date + 'T' + event.from + ':00-03:00') > this.clock.instant()
    );
  }
  readonly days = computed(() => {
    const selected = this.selectedDay();
    if (this.layout() === 'day') return [selected];
    const start = weekStart(this.layout() === 'week' ? selected : `${selected.slice(0, 7)}-01`);
    const length =
      this.layout() === 'week'
        ? 7
        : Math.ceil(
            (dayNumber(shiftMonth(`${selected.slice(0, 7)}-01`, 1)) - dayNumber(start)) / 7,
          ) * 7;
    return Array.from({ length }, (_, i) => addDays(start, i));
  });
  readonly query = computed(() => ({
    from: this.days()[0],
    to: this.days().at(-1)!,
    room: this.roomFilter(),
    professionalId: this.userFilter(),
  }));
  readonly resource = this.agenda.eventsResource(this.query);
  readonly events = computed(() => (this.resource.hasValue() ? this.resource.value() : []));
  readonly heading = computed(() =>
    this.layout() === 'month'
      ? formatMonth(this.selectedDay().slice(0, 7))
      : this.layout() === 'week'
        ? `${formatDate(this.days()[0])} – ${formatDate(this.days()[6])}`
        : formatDate(this.selectedDay()),
  );
  readonly date = formatDate;
  readonly frequency = frequency;
  readonly rooms = computed(() => (this.roomFilter() ? [this.roomFilter()] : [1, 2, 3]));
  dayEvents(day: string, room = 0): AgendaEvent[] {
    return this.events().filter((e) => e.date === day && (!room || e.room === room));
  }
  weekday(day: string): string {
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${day}T12:00:00Z`));
  }
  shift(amount: number): void {
    this.selectedDay.update((day) =>
      this.layout() === 'month'
        ? shiftMonth(day, amount)
        : addDays(day, amount * (this.layout() === 'week' ? 7 : 1)),
    );
  }
  setDate(date: string): void {
    if (validDate(date)) this.selectedDay.set(date);
  }
  create(room = 1): void {
    this.editing.set({ mode: 'new', event: null, room });
  }
  edit(mode: 'one' | 'future'): void {
    const event = this.detail();
    if (event) {
      this.detail.set(null);
      this.editing.set({ mode, event, room: event.room });
    }
  }
  async cancel(): Promise<void> {
    const event = this.detail();
    if (!event || this.pending()) return;
    this.pending.set(true);
    try {
      const future = this.cancelling() === 'future';
      await this.agenda.cancel(event, future, this.operation.key({ event, future }));
      this.operation.confirmed();
      this.pending.set(false);
      this.closeDetail();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
  openDetail(event: AgendaEvent): void {
    this.auditCursor.set('');
    this.auditHistory.set([]);
    this.error.set('');
    this.cancelling.set(null);
    this.detail.set(event);
  }
  closeDetail(): void {
    if (this.pending()) return;
    this.detail.set(null);
    this.cancelling.set(null);
    this.error.set('');
  }
}
