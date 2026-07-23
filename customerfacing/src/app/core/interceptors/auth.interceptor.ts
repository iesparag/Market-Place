import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Attaches the access token and transparently refreshes it on a 401.
 * On refresh failure the session is cleared. SSR has no token, so it's a passthrough.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const auth = inject(AuthService);

  const token = isBrowser ? auth.token() : null;
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  // Never intercept-refresh the auth endpoints themselves (avoids loops).
  const isAuthEndpoint = /\/auth\/(login|register|refresh)/.test(req.url);
  if (!isBrowser || isAuthEndpoint) return next(authed);

  return next(authed).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || !auth.getRefreshToken()) return throwError(() => err);
      // Access token expired → refresh once, then replay the original request.
      return auth.refresh().pipe(
        switchMap((fresh) => next(req.clone({ setHeaders: { Authorization: `Bearer ${fresh}` } }))),
        catchError((refreshErr) => {
          auth.logout();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
