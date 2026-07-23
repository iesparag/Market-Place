import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { TokenService } from '../services/token.service';

/** Attach the bearer token to every outgoing request. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenService).get();
  if (!token) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
