import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';

import { routes } from './app.routes';
import { cartReducer } from './store/cart/cart.reducer';
import { cartPersistence } from './store/cart/cart.persistence';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])), // withFetch = SSR-friendly
    // Root store: cart is global + persisted to localStorage; feature state lazy-loaded per feature.
    provideStore({ cart: cartReducer }, { metaReducers: [cartPersistence] }),
    provideEffects([]),
  ],
};
