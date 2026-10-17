import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export interface FeatureFlags {
  couponsEnabled: boolean;
  loyaltyEnabled: boolean;
  referralEnabled: boolean;
  frequentlyBoughtTogetherEnabled: boolean;
  wishlistPriceDropAlertsEnabled: boolean;
  recentlyViewedEnabled: boolean;
  checkoutAdBannerEnabled: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  couponsEnabled: true,
  loyaltyEnabled: true,
  referralEnabled: true,
  frequentlyBoughtTogetherEnabled: true,
  wishlistPriceDropAlertsEnabled: true,
  recentlyViewedEnabled: true,
  checkoutAdBannerEnabled: true,
};

/**
 * Admin on/off switches (settings.page.ts "Features" section), read from GET /settings
 * — the same flags the backend already enforces server-side; this just keeps the UI
 * from showing a control for something that would be rejected/no-op when used.
 * Fetched once per page load and cached (signal), not re-fetched per component.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  private readonly api = inject(ApiService);
  readonly flags = signal<FeatureFlags>(DEFAULT_FLAGS);
  private loaded = false;

  constructor() {
    this.load();
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.api.get<{ features?: Partial<FeatureFlags> }>('/settings').subscribe({
      next: (s) => this.flags.set({ ...DEFAULT_FLAGS, ...s.features }),
      error: () => {},
    });
  }
}
