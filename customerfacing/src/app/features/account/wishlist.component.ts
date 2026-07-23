import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { WishlistService } from '../../core/services/wishlist.service';
import { ProductCardComponent } from '../../shared/product-card.component';
import type { CatalogProduct } from '../../core/services/catalog.service';

@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [RouterLink, ProductCardComponent],
  template: `
    <div class="whead">
      <h1>Your wishlist</h1>
      @if (visible().length) { <span class="muted">{{ visible().length }} item{{ visible().length === 1 ? '' : 's' }} saved</span> }
    </div>

    @if (visible().length) {
      <div class="grid">
        @for (p of visible(); track p._id) { <app-product-card [p]="p" /> }
      </div>
    } @else {
      <div class="empty card">
        <div class="ei">🤍</div>
        <h2>Your wishlist is empty</h2>
        <p class="muted">Tap the heart on any product to save it here.</p>
        <a routerLink="/catalog" class="btn btn-primary">Browse products →</a>
      </div>
    }
  `,
  styles: [
    `
      .whead { display: flex; align-items: baseline; gap: 12px; margin-bottom: 18px; }
      .whead h1 { font-size: 1.6rem; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 18px; }
      .empty { text-align: center; padding: 60px 20px; max-width: 460px; margin: 40px auto; }
      .ei { font-size: 3.2rem; margin-bottom: 10px; }
      .empty h2 { margin-bottom: 6px; } .empty p { margin-bottom: 18px; }
    `,
  ],
})
export class WishlistComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly wl = inject(WishlistService);

  private products = signal<Map<string, CatalogProduct>>(new Map());
  /** Reactive: unhearting a card removes its id from the service → it disappears here instantly. */
  visible = computed(() =>
    [...this.wl.ids()].map((id) => this.products().get(id)).filter((p): p is CatalogProduct => !!p),
  );

  ngOnInit(): void {
    this.api.get<CatalogProduct[]>('/wishlist').subscribe({
      next: (list) => {
        this.products.set(new Map(list.map((p) => [p._id, p])));
        this.wl.setFromProducts(list);
      },
    });
  }
}
