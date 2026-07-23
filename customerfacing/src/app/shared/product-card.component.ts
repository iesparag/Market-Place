import { Component, inject, Input, computed, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { CartFacade } from '../store/cart/cart.facade';
import type { CartLine } from '../store/cart/cart.state';
import { AuthService } from '../core/services/auth.service';
import { WishlistService } from '../core/services/wishlist.service';
import { VegMarkComponent, foodTypeOf } from './veg-mark.component';
import type { CatalogProduct } from '../core/services/catalog.service';

/** Rich storefront product card — image (hover-swap), rating, price, wishlist heart, cart qty stepper. */
@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [RouterLink, VegMarkComponent],
  template: `
    <div class="pcard">
      <a class="media" [routerLink]="['/p', p.slug]">
        @if (discount()) { <span class="disc">-{{ discount() }}%</span> }
        @if (foodType(); as ft) { <span class="vmark"><app-veg-mark [type]="ft" [size]="15" /></span> }
        @if (imgs().length && !broken()) {
          <img class="i1" [src]="imgs()[0]" [alt]="p.title" (error)="broken.set(true)" />
          @if (imgs()[1]) { <img class="i2" [src]="imgs()[1]" [alt]="p.title" /> }
        } @else { <span class="emoji">{{ emoji() }}</span> }
        @if (outOfStock()) { <span class="oosbadge">Out of stock</span> }
        <button class="heart" [class.on]="wl.has(p._id)" (click)="toggleWish($event)" aria-label="Wishlist">{{ wl.has(p._id) ? '♥' : '♡' }}</button>
      </a>
      <div class="body">
        <a class="title" [routerLink]="['/p', p.slug]">{{ p.title }}</a>
        @if (p.store?.name) { <div class="store muted">by {{ p.store!.name }}</div> }
        <div class="rate">
          @if (p.ratingCount) {
            <span class="chip"><span class="stars">★</span> {{ (p.ratingAvg ?? 0).toFixed(1) }}</span>
            <span class="muted">({{ p.ratingCount }})</span>
          } @else { <span class="newchip">✦ New</span> }
        </div>
        <div class="pricerow">
          <span class="price">₹{{ min() / 100 }}</span>
          @if (compareAt()) { <span class="mrp">₹{{ compareAt()! / 100 }}</span> }
          @if (discount()) { <span class="save">Save {{ discount() }}%</span> }
        </div>
        <div class="deliv muted">🚚 Free delivery</div>

        @if (qty() > 0) {
          <div class="stepper">
            <button class="sbtn" (click)="dec()" aria-label="Decrease">−</button>
            <span class="q">{{ qty() }} in cart</span>
            <button class="sbtn" (click)="inc()" [disabled]="outOfStock()" aria-label="Increase">+</button>
          </div>
        } @else {
          <button class="btn btn-primary btn-sm add" [disabled]="outOfStock()" (click)="quickAdd()">🛒 Add to cart</button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .pcard { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;
               display: flex; flex-direction: column; transition: transform 0.16s, box-shadow 0.16s; height: 100%; }
      .pcard:hover { transform: translateY(-5px); box-shadow: var(--shadow-lg); }
      .media { position: relative; aspect-ratio: 1 / 1; display: grid; place-items: center; background: #f5f5f4; overflow: hidden; }
      .media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: opacity 0.35s ease, transform 0.4s ease; }
      .i2 { opacity: 0; }
      .pcard:hover .i1 { transform: scale(1.06); }
      .pcard:hover .i2 { opacity: 1; transform: scale(1.06); }
      .emoji { font-size: 3.6rem; }
      .disc { position: absolute; top: 10px; left: 10px; z-index: 2; background: var(--danger); color: #fff; font-size: 0.72rem; font-weight: 800; padding: 3px 8px; border-radius: 6px; }
      .vmark { position: absolute; bottom: 8px; left: 8px; z-index: 2; background: rgba(255,255,255,0.95); border-radius: 5px; padding: 3px; box-shadow: var(--shadow-sm); display: inline-flex; }
      .oosbadge { position: absolute; inset: 0; z-index: 2; background: rgba(255,255,255,0.72); color: var(--danger); font-weight: 800; display: grid; place-items: center; font-size: 0.95rem; }
      .heart { position: absolute; top: 8px; right: 8px; z-index: 3; width: 36px; height: 36px; border-radius: 50%; border: none; background: rgba(255,255,255,0.95); box-shadow: var(--shadow-sm); cursor: pointer; font-size: 1.15rem; line-height: 1; color: #e11d48; display: grid; place-items: center; transition: transform 0.12s, background 0.15s; }
      .heart:hover { transform: scale(1.14); }
      .heart.on { background: #ffe4e8; }
      .body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
      .title { font-weight: 600; color: var(--text); font-size: 0.95rem; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.5em; }
      .title:hover { color: var(--brand-700); }
      .store { font-size: 0.78rem; }
      .rate { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; min-height: 20px; }
      .chip { background: #f0fdf4; color: #15803d; font-weight: 700; border-radius: 6px; padding: 1px 7px; display: inline-flex; align-items: center; gap: 3px; }
      .chip .stars { color: #15803d; } .small { font-size: 0.8rem; }
      .newchip { background: #eef2ff; color: #4f46e5; font-weight: 700; border-radius: 6px; padding: 1px 8px; font-size: 0.72rem; }
      .pricerow { display: flex; align-items: baseline; gap: 8px; margin-top: 2px; flex-wrap: wrap; }
      .price { font-size: 1.2rem; font-weight: 800; }
      .mrp { text-decoration: line-through; color: var(--text-muted); font-size: 0.85rem; }
      .save { color: var(--success, #15803d); font-size: 0.78rem; font-weight: 700; }
      .deliv { font-size: 0.76rem; margin-top: 1px; }
      .add { margin-top: auto; }
      .stepper { margin-top: auto; display: flex; align-items: center; justify-content: space-between; border: 1.5px solid var(--brand-600); border-radius: var(--radius-sm); overflow: hidden; }
      .sbtn { width: 40px; height: 38px; border: none; background: var(--brand-50, #fff5ef); color: var(--brand-700); font-size: 1.2rem; font-weight: 800; cursor: pointer; }
      .sbtn:hover { background: var(--brand-600); color: #fff; }
      .sbtn:disabled { opacity: 0.4; cursor: not-allowed; }
      .q { font-weight: 700; font-size: 0.85rem; color: var(--brand-700); }
    `,
  ],
})
export class ProductCardComponent {
  @Input({ required: true }) p!: CatalogProduct;
  private readonly cart = inject(CartFacade);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly wl = inject(WishlistService);
  broken = signal(false);

  private lines = toSignal(this.cart.lines$, { initialValue: [] as CartLine[] });
  private cheapest = computed(() => [...(this.p.variants ?? [])].sort((a, b) => a.price - b.price)[0]);
  qty = computed(() => this.lines().find((l) => l.variantSku === this.cheapest()?.sku)?.qty ?? 0);

  min = () => this.cheapest()?.price ?? 0;
  compareAt = () => this.cheapest()?.compareAtPrice;
  outOfStock = () => (this.p.variants ?? []).every((v) => v.trackInventory !== false && v.stock === 0);
  discount = () => {
    const c = this.compareAt();
    const m = this.min();
    return c && c > m ? Math.round(((c - m) / c) * 100) : 0;
  };
  imgs = () => this.p.images ?? [];
  foodType = () => foodTypeOf(this.p);
  emoji = () => {
    const t = this.p.title.toLowerCase();
    if (t.includes('pizza')) return '🍕';
    if (t.includes('rice')) return '🍚';
    if (t.includes('burger')) return '🍔';
    return '🛍️';
  };

  toggleWish(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    if (!this.auth.isLoggedIn()) { void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } }); return; }
    this.wl.toggle(this.p._id);
  }

  private buildLine(qty: number): CartLine | null {
    const v = this.cheapest();
    if (!v) return null;
    return {
      productId: this.p._id, variantSku: v.sku,
      title: `${this.p.title} (${Object.values(v.optionValues ?? {}).join(' / ') || v.sku})`,
      slug: this.p.slug, image: this.imgs()[0],
      storeId: this.p.storeId, storeName: this.p.store?.name, qty, unitPrice: v.price, modifierNames: [],
    };
  }
  quickAdd(): void { const l = this.buildLine(1); if (l) this.cart.add(l); }
  inc(): void { const l = this.buildLine(1); if (l) this.cart.add(l); }
  dec(): void { const v = this.cheapest(); if (v) this.cart.setQty(v.sku, this.qty() - 1); }
}
