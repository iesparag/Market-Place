import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { EMPTY, catchError, map, switchMap, tap } from 'rxjs';
import type { Me, NavSectionMeta } from '@app/shared';
import { ApiService } from '../../core/services/api.service';
import { TokenService } from '../../core/services/token.service';
import { SocketService } from '../../core/services/socket.service';
import { AuthActions } from './auth.actions';

@Injectable()
export class AuthEffects {
  private readonly actions$ = inject(Actions);
  private readonly api = inject(ApiService);
  private readonly tokens = inject(TokenService);
  private readonly socket = inject(SocketService);
  private readonly router = inject(Router);

  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      switchMap(({ email, password }) =>
        this.api.post<{ token: string; user: Me }>('/auth/login', { email, password }).pipe(
          map((res) => AuthActions.loginSuccess({ token: res.token, user: res.user as never })),
          catchError((e) => [AuthActions.loginFailure({ error: e?.message ?? 'Login failed' })]),
        ),
      ),
    ),
  );

  onLoginSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loginSuccess),
        tap(({ token }) => {
          this.tokens.set(token);
          this.socket.connect(token);
          void this.router.navigate(['/']);
        }),
        switchMap(() => this.loadMe$()),
      ),
    { dispatch: true },
  );

  bootstrap$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.bootstrap),
      switchMap(() => {
        const token = this.tokens.get();
        if (!token) return EMPTY;
        this.socket.connect(token);
        return this.loadMe$();
      }),
    ),
  );

  logout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.logout),
        tap(() => {
          this.tokens.clear();
          this.socket.disconnect();
          void this.router.navigate(['/login']);
        }),
      ),
    { dispatch: false },
  );

  private loadMe$() {
    return this.api.get<Me>('/me').pipe(
      switchMap((me) =>
        this.api.get<NavSectionMeta[]>('/me/navigation').pipe(
          map((nav) =>
            AuthActions.loadMeSuccess({
              user: {
                id: me.id,
                name: me.name,
                email: me.email,
                role: me.role,
                storeId: me.storeId,
                permissions: me.permissions,
              },
              nav,
            }),
          ),
        ),
      ),
      catchError(() => EMPTY),
    );
  }
}
