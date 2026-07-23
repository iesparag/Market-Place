import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/** Backend-persisted wishlist. Holds the set of wishlisted product ids for instant heart state. */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly ids = signal<Set<string>>(new Set());
  readonly count = computed(() => this.ids().size);

  constructor() {
    // Load from server when logged in; clear on logout.
    effect(
      () => {
        if (this.auth.isLoggedIn()) this.load();
        else this.ids.set(new Set());
      },
      { allowSignalWrites: true },
    );
  }

  load(): void {
    if (!this.browser) return;
    this.api.get<{ _id: string }[]>('/wishlist').subscribe({
      next: (products) => this.ids.set(new Set(products.map((p) => p._id))),
      error: () => {},
    });
  }

  /** Sync the id set from an already-fetched product list (keeps the header badge accurate). */
  setFromProducts(products: { _id: string }[]): void {
    this.ids.set(new Set(products.map((p) => p._id)));
  }

  has(productId: string): boolean {
    return this.ids().has(productId);
  }

  /** Optimistic toggle → backend add/remove. */
  toggle(productId: string): void {
    const next = new Set(this.ids());
    if (next.has(productId)) {
      next.delete(productId);
      this.api.delete(`/wishlist/${productId}`).subscribe({ error: () => {} });
    } else {
      next.add(productId);
      this.api.post('/wishlist', { productId }).subscribe({ error: () => {} });
    }
    this.ids.set(next);
  }
}
