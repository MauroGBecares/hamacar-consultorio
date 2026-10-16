import { InjectionToken, Signal, signal } from '@angular/core';
/** Application state port keeps shared UI independent of authentication. */
export const APP_LOCKED = new InjectionToken<Signal<boolean>>('APP_LOCKED', {
  factory: () => signal(false),
});
