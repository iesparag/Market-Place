import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { TokenService } from '../services/token.service';

/** On 401 clear the session and bounce to login. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const tokens = inject(TokenService);
  return next(req).pipe(
    catchError((err) => {
      if (err.status === 401) {
        tokens.clear();
        void router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
