import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { map, take } from 'rxjs';
import { selectIsAuthenticated } from '../../store/auth/auth.selectors';
import { TokenService } from '../services/token.service';

/** Allow if authenticated (or a token exists and /me is loading). */
export const authGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);
  const tokens = inject(TokenService);
  if (tokens.get()) return true;
  return store.select(selectIsAuthenticated).pipe(
    take(1),
    map((isAuth) => isAuth || router.createUrlTree(['/login'])),
  );
};
