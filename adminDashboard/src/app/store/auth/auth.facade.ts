import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { AuthActions } from './auth.actions';
import { selectNav, selectUser, selectIsAuthenticated } from './auth.selectors';

/** Components use this facade, never the Store directly. */
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly store = inject(Store);

  readonly user$ = this.store.select(selectUser);
  readonly nav$ = this.store.select(selectNav);
  readonly isAuthenticated$ = this.store.select(selectIsAuthenticated);

  login(email: string, password: string): void {
    this.store.dispatch(AuthActions.login({ email, password }));
  }
  logout(): void {
    this.store.dispatch(AuthActions.logout());
  }
}
