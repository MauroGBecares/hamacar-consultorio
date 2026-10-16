import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { loadPublicConfig, PUBLIC_CONFIG } from './app/core/config/public-config';

loadPublicConfig()
  .then((config) =>
    bootstrapApplication(App, {
      ...appConfig,
      providers: [...appConfig.providers, { provide: PUBLIC_CONFIG, useValue: config }],
    }),
  )
  .catch(() => {
    document.body.textContent =
      'No se pudo iniciar Hamacar. Revisá la conexión y la configuración pública del despliegue, y recargá la página.';
  });
