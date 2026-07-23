import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { NavSectionMeta } from '@app/shared';
import type { AuthUser } from './auth.state';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    Bootstrap: emptyProps(),
    Login: props<{ email: string; password: string }>(),
    'Login Success': props<{ token: string; user: AuthUser }>(),
    'Login Failure': props<{ error: string }>(),
    'Load Me Success': props<{ user: AuthUser; nav: NavSectionMeta[] }>(),
    Logout: emptyProps(),
  },
});
