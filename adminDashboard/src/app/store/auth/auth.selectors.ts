import { createFeatureSelector, createSelector } from '@ngrx/store';
import { WILDCARD_PERMISSION } from '@app/shared';
import type { AuthState } from './auth.state';

export const selectAuth = createFeatureSelector<AuthState>('auth');
export const selectUser = createSelector(selectAuth, (s) => s.user);
export const selectIsAuthenticated = createSelector(selectUser, (u) => !!u);
export const selectNav = createSelector(selectAuth, (s) => s.nav);
export const selectPermissions = createSelector(selectUser, (u) => u?.permissions ?? []);

export const selectHasPermission = (perm: string) =>
  createSelector(
    selectPermissions,
    (perms) => perms.includes(WILDCARD_PERMISSION) || perms.includes(perm),
  );
