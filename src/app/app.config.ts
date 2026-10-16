import {
  ApplicationConfig,
  inject,
  LOCALE_ID,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/es-AR';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { ATTACHMENT_ACCESS } from './shared/models/attachment-access';
import { LocalFileStore } from './core/files/local-file-store.service';

import { APP_LOCKED } from './shared/models/app-locked';
import { SessionService } from './core/identity/session.service';
registerLocaleData(localeAr);

export const appConfig: ApplicationConfig = {
  providers: [
    // Angular 22 ya es zoneless. Lo explicitamos para documentar la decisión..
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    { provide: LOCALE_ID, useValue: 'es-AR' },
    { provide: ATTACHMENT_ACCESS, useExisting: LocalFileStore },
    { provide: APP_LOCKED, useFactory: () => inject(SessionService).locked },
  ],
};
