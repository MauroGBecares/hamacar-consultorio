import { Injectable, signal } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class Clock {
  readonly instant = signal(Date.now());
  constructor() {
    setInterval(() => this.instant.set(Date.now()), 30000);
    window.addEventListener('focus', () => this.instant.set(Date.now()));
  }
  today(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(
      new Date(this.instant()),
    );
  }
  now(): string {
    return new Date(this.instant()).toISOString();
  }
}
