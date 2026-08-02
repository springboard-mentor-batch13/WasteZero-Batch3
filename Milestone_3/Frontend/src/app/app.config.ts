import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // PRIMARY FIX: Activates Angular's signal-reactive scheduler.
    // Without this, signal writes from HTTP callbacks race with Angular's
    // CD verify pass (even when zone.js is absent), causing NG0100.
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient()
  ]
};