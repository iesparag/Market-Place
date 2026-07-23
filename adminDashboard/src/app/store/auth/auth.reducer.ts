import { createReducer, on } from '@ngrx/store';
import { AuthActions } from './auth.actions';
import { initialAuthState } from './auth.state';

export const authReducer = createReducer(
  initialAuthState,
  on(AuthActions.login, (s) => ({ ...s, loading: true, error: null })),
  on(AuthActions.loginSuccess, (s, { user }) => ({ ...s, user, loading: false })),
  on(AuthActions.loginFailure, (s, { error }) => ({ ...s, error, loading: false })),
  on(AuthActions.loadMeSuccess, (s, { user, nav }) => ({ ...s, user, nav })),
  on(AuthActions.logout, () => initialAuthState),
);
