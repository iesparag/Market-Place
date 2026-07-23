import type { NavSectionMeta } from '@app/shared';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  storeId?: string;
  permissions: string[];
}

export interface AuthState {
  user: AuthUser | null;
  nav: NavSectionMeta[];
  loading: boolean;
  error: string | null;
}

export const initialAuthState: AuthState = {
  user: null,
  nav: [],
  loading: false,
  error: null,
};
