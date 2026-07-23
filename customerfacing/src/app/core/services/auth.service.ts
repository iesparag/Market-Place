import { Injectable, afterNextRender, computed, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { finalize, map, shareReplay, tap, throwError, type Observable } from 'rxjs';
import type { Me } from '@app/shared';
import { ApiService } from './api.service';

const TOKEN_KEY = 'mkt_token';
const REFRESH_KEY = 'mkt_refresh';
const USER_KEY = 'mkt_user';

export interface Account extends Me {
  phone?: string;
  emailVerified?: boolean;
}

/** Customer auth. SSR-safe: only touches localStorage in the browser. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);

  // Start logged-out so the first client render MATCHES the server (which has no
  // localStorage). Hydrating with a different value causes Angular hydration
  // mismatches — the exact bug where "Hello, X" and "Sign in" both showed.
  readonly user = signal<Account | null>(null);
  readonly isLoggedIn = computed(() => !!this.user());

  constructor() {
    // Runs once after hydration completes (browser only) → safely restore session.
    afterNextRender(() => this.user.set(this.readUser()));
  }

  private readUser(): Account | null {
    if (!this.browser) return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  }

  token(): string | null {
    return this.browser ? localStorage.getItem(TOKEN_KEY) : null;
  }
  getRefreshToken(): string | null {
    return this.browser ? localStorage.getItem(REFRESH_KEY) : null;
  }
  private setAccess(token: string): void { if (this.browser) localStorage.setItem(TOKEN_KEY, token); }
  private setRefresh(rt: string): void { if (this.browser) localStorage.setItem(REFRESH_KEY, rt); }

  private persist(token: string, refreshToken: string, user: Me): void {
    if (!this.browser) return;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.user.set(user);
  }

  login(email: string, password: string) {
    return this.api
      .post<{ token: string; refreshToken: string; user: Me }>('/auth/login', { email, password })
      .pipe(tap((r) => this.persist(r.token, r.refreshToken, r.user)));
  }

  register(name: string, email: string, password: string) {
    return this.api
      .post<{ token: string; refreshToken: string; user: Me }>('/auth/register', { name, email, password })
      .pipe(tap((r) => this.persist(r.token, r.refreshToken, r.user)));
  }

  /** Exchange the refresh token for a fresh access token. Deduped so parallel 401s refresh once. */
  private refreshing$: Observable<string> | null = null;
  refresh(): Observable<string> {
    if (this.refreshing$) return this.refreshing$;
    const rt = this.getRefreshToken();
    if (!rt) return throwError(() => new Error('No refresh token'));
    this.refreshing$ = this.api
      .post<{ token: string; refreshToken: string; user: Me }>('/auth/refresh', { refreshToken: rt })
      .pipe(
        tap((r) => {
          this.setAccess(r.token);
          this.setRefresh(r.refreshToken);
          this.user.set(r.user);
          if (this.browser) localStorage.setItem(USER_KEY, JSON.stringify(r.user));
        }),
        map((r) => r.token),
        shareReplay(1),
        finalize(() => { this.refreshing$ = null; }),
      );
    return this.refreshing$;
  }

  logout(): void {
    if (this.browser) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
    }
    this.user.set(null);
  }

  /** Refresh the full profile (phone, emailVerified) from the server. */
  refreshMe() {
    return this.api.get<Account>('/me').pipe(
      tap((me) => {
        this.user.set(me);
        if (this.browser) localStorage.setItem(USER_KEY, JSON.stringify(me));
      }),
    );
  }

  updateProfile(name: string, phone: string) {
    return this.api.patch<Account>('/me', { name, phone }).pipe(
      tap((me) => {
        const cur = this.user();
        const merged = { ...cur, ...me } as Account;
        this.user.set(merged);
        if (this.browser) localStorage.setItem(USER_KEY, JSON.stringify(merged));
      }),
    );
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.api.post<{ changed: boolean }>('/auth/change-password', { currentPassword, newPassword });
  }
  sendOtp() {
    return this.api.post<{ sent: boolean }>('/auth/send-otp', {});
  }
  verifyOtp(code: string) {
    return this.api.post<{ verified: boolean }>('/auth/verify-otp', { code }).pipe(
      tap(() => {
        const cur = this.user();
        if (cur) { const u = { ...cur, emailVerified: true }; this.user.set(u); if (this.browser) localStorage.setItem(USER_KEY, JSON.stringify(u)); }
      }),
    );
  }
}
