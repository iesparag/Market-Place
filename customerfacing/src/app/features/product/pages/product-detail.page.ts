import { Component, computed, inject, Input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { CartFacade } from '../../../store/cart/cart.facade';
import type { CartLine } from '../../../store/cart/cart.state';
import { CatalogService, type CatalogProduct } from '../../../core/services/catalog.service';
import { AuthService } from '../../../core/services/auth.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { ReviewsComponent } from '../components/reviews.component';
import { FaqComponent } from '../components/faq.component';
import { VegMarkComponent, foodTypeOf, type FoodType } from '../../../shared/veg-mark.component';
import type { Variant, ModifierGroup } from '@app/shared';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [RouterLink, ReviewsComponent, FaqComponent, VegMarkComponent],
  template: `
    @if (product(); as p) {
      <nav class="crumb muted">
        <a routerLink="/">Home</a> › <a routerLink="/catalog">Catalog</a> › <span>{{ p.title }}</span>
      </nav>

      <div class="grid">
        <!-- Gallery (Amazon-style: vertical thumbs + big main) -->
        <div class="gallery">
          @if (p.images.length > 1) {
            <div class="thumbs">
              @for (img of p.images; track img) {
                <button class="thumb" [class.on]="img === mainImage()"
                        (mouseenter)="mainImage.set(img)" (click)="mainImage.set(img)"><img [src]="img" alt="" /></button>
              }
            </div>
          }
          <div class="main card">
            @if (mainImage()) { <img [src]="mainImage()" [alt]="p.title" /> } @else { <span class="emoji">{{ emoji(p) }}</span> }
          </div>
        </div>

        <!-- Info -->
        <div class="info">
          @if (p.store?.slug) { <a class="vendor" [routerLink]="['/store', p.store!.slug]">{{ p.store!.name }} ›</a> }
          <h1>{{ p.title }}</h1>
          @if (p.code) { <div class="pcode">Product code: <b>{{ p.code }}</b></div> }
          <div class="rate">
            @if (foodType(); as ft) {
              <span class="vtag" [class.non]="ft !== 'veg'"><app-veg-mark [type]="ft" [size]="15" /> {{ ftLabel(ft) }}</span>
            }
            <span class="stars">{{ stars(p.ratingAvg ?? 0) }}</span>
            <span class="muted">{{ (p.ratingAvg ?? 0).toFixed(1) }} · {{ p.ratingCount ?? 0 }} ratings</span>
          </div>

          <div class="pricebox">
            <span class="price">₹{{ livePrice() / 100 }}</span>
            @if (variant()?.compareAtPrice) { <span class="mrp">₹{{ variant()!.compareAtPrice! / 100 }}</span> }
          </div>

          <p class="desc">{{ p.description }}</p>

          @if (specs().length) {
            <div class="specs">
              @for (s of specs(); track s.key) {
                <div class="spec"><span class="sk">{{ s.label }}</span><span class="sv">{{ fmt(s) }}</span></div>
              }
            </div>
          }

          @if (variantAxisLabel()) { <h4>{{ variantAxisLabel() }}</h4> }
          <div class="options">
            @for (v of p.variants; track v.sku) {
              <label class="opt" [class.sel]="v.sku === variant()?.sku" [class.oos]="v.stock === 0">
                <input type="radio" name="variant" [checked]="v.sku === variant()?.sku" [disabled]="v.stock === 0" (change)="variant.set(v)" />
                {{ label(v) }} · ₹{{ v.price / 100 }}
                @if (v.stock === 0) { <span class="tag">out</span> } @else if (v.stock <= 5) { <span class="tag low">{{ v.stock }} left</span> }
              </label>
            }
          </div>

          @for (group of p.modifierGroups; track group.name) {
            <h4>{{ group.name }} <span class="muted small">({{ group.selection }})</span></h4>
            <div class="options">
              @for (o of group.options; track o.name) {
                <label class="opt" [class.sel]="isSelected(o.name)">
                  <input [type]="group.selection === 'single' ? 'radio' : 'checkbox'" [name]="group.name" [checked]="isSelected(o.name)" (change)="toggle(group, o.name)" />
                  {{ o.name }} @if (o.priceDelta) { · +₹{{ o.priceDelta / 100 }} }
                </label>
              }
            </div>
          }

          <div class="buyrow">
            @if (inCart() > 0) {
              <div class="incart">
                <span class="added">✓ In cart</span>
                <div class="qty live">
                  <button (click)="decCart()" aria-label="Decrease">−</button><span>{{ inCart() }}</span><button (click)="incCart(p)" [disabled]="soldOut()" aria-label="Increase">+</button>
                </div>
              </div>
            } @else {
              <div class="qty">
                <button (click)="dec()">−</button><span>{{ qty() }}</span><button (click)="inc()">+</button>
              </div>
            }
            <button class="btn wish" [class.on]="wl.has(p._id)" (click)="toggleWish(p)">{{ wl.has(p._id) ? '♥' : '♡' }}</button>
          </div>

          <div class="cta">
            @if (inCart() > 0) {
              <a class="btn btn-primary" routerLink="/cart">Go to cart →</a>
            } @else {
              <button class="btn btn-primary" [disabled]="soldOut()" (click)="addToCart(p)">{{ soldOut() ? 'Out of stock' : 'Add to cart' }}</button>
            }
            <button class="btn buynow" [disabled]="soldOut()" (click)="buyNow(p)">Buy now</button>
          </div>

          <div class="ship card">
            <div>🚚 {{ soldOut() ? 'Currently unavailable' : 'In stock' }} · free delivery over ₹500</div>
            <div class="muted">Ships from {{ p.store?.name || 'vendor' }} · easy 7-day returns</div>
          </div>
        </div>
      </div>

      @if (p.related?.length) {
        <section class="related">
          <h2>Related products</h2>
          <div class="rgrid">
            @for (r of p.related; track r._id) {
              <a class="card rcard" [routerLink]="['/p', r.slug]">
                <div class="rthumb">@if (r.images.length) { <img [src]="r.images[0]" alt="" /> } @else { {{ emoji(r) }} }</div>
                <div class="rtitle">{{ r.title }}</div>
                <div class="price">₹{{ minPrice(r) / 100 }}</div>
              </a>
            }
          </div>
        </section>
      }

      <app-faq [productId]="p._id" />
      <app-reviews [productId]="p._id" />
    } @else if (error()) {
      <div class="card">Product not found. <a routerLink="/catalog">Browse catalog</a></div>
    } @else { <div class="card muted">Loading…</div> }
  `,
  styles: [
    `
      .crumb { margin-bottom: 14px; font-size: 0.85rem; } .crumb a { color: var(--text-muted); }
      .grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 44px; align-items: start; }
      @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
      .gallery { display: flex; gap: 14px; position: sticky; top: 130px; }
      @media (max-width: 820px) { .gallery { position: static; flex-direction: column-reverse; } }
      .thumbs { display: flex; flex-direction: column; gap: 10px; }
      @media (max-width: 820px) { .thumbs { flex-direction: row; flex-wrap: wrap; } }
      .thumb { width: 66px; height: 66px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; cursor: pointer; padding: 0; background: #fff; transition: border-color 0.12s; }
      .thumb.on { border-color: var(--brand-600); box-shadow: 0 0 0 1px var(--brand-600); }
      .thumb img { width: 100%; height: 100%; object-fit: cover; }
      .main { flex: 1; height: 540px; display: grid; place-items: center; overflow: hidden; padding: 0; background: #fff; }
      .main img { width: 100%; height: 100%; object-fit: contain; padding: 22px; }
      .emoji { font-size: 9rem; }
      .vendor { font-size: 0.85rem; color: var(--brand-600); }
      h1 { margin: 6px 0; } .rate { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
      .pcode { font-size: 0.78rem; color: var(--text-muted); font-family: ui-monospace, monospace; margin-bottom: 6px; }
      .stars { color: #f5a623; } .pricebox { display: flex; align-items: baseline; gap: 10px; }
      .vtag { display: inline-flex; align-items: center; gap: 6px; background: #e7f8ee; color: #0a8f3c; border: 1px solid #86efac; font-weight: 700; font-size: 0.78rem; padding: 3px 9px; border-radius: 999px; }
      .vtag.non { background: #fdecec; color: #c0392b; border-color: #f2b8b1; }
      .specs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 12px 0 4px; }
      .spec { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; }
      .spec .sk { display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
      .spec .sv { font-weight: 700; font-size: 0.92rem; text-transform: capitalize; }
      .price { font-size: 1.9rem; font-weight: 800; color: var(--brand-700); }
      .mrp { text-decoration: line-through; color: var(--text-muted); }
      .desc { color: var(--text-muted); margin: 12px 0; } h4 { margin: 16px 0 8px; } .small { font-size: 0.8rem; font-weight: 400; }
      .options { display: flex; flex-wrap: wrap; gap: 10px; }
      .opt { display: inline-flex; align-items: center; gap: 8px; padding: 8px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; font-size: 0.9rem; }
      .opt.sel { border-color: var(--brand-600); background: var(--brand-50); color: var(--brand-700); font-weight: 600; }
      .opt.oos { opacity: 0.5; } .tag { font-size: 0.72rem; color: var(--danger); } .tag.low { color: var(--warning); }
      .buyrow { display: flex; align-items: center; gap: 12px; margin-top: 22px; }
      .qty { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: var(--radius-sm); }
      .qty button { width: 38px; height: 38px; border: none; background: none; font-size: 1.1rem; cursor: pointer; }
      .qty span { width: 40px; text-align: center; }
      .qty.live { border-color: var(--brand-600); } .qty.live button { color: var(--brand-700); font-weight: 800; }
      .incart { display: flex; align-items: center; gap: 12px; }
      .added { color: #15803d; font-weight: 700; font-size: 0.9rem; }
      .wish { font-size: 1.2rem; color: #e11d48; } .wish.on { color: #e11d48; border-color: #e11d48; background: #ffe4e8; }
      .cta { display: flex; gap: 12px; margin-top: 14px; }
      .cta .btn { flex: 1; }
      .buynow { background: #ff9900; color: #111; border-color: #ff9900; font-weight: 700; }
      .ship { margin-top: 18px; font-size: 0.9rem; }
      .related { margin-top: 40px; }
      .rgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; margin-top: 12px; }
      .rcard { transition: transform 0.15s, box-shadow 0.15s; } .rcard:hover { transform: translateY(-3px); box-shadow: var(--shadow); }
      .rthumb { height: 100px; display: grid; place-items: center; background: var(--surface-2); border-radius: var(--radius-sm); overflow: hidden; margin-bottom: 8px; font-size: 2rem; }
      .rthumb img { width: 100%; height: 100%; object-fit: cover; } .rtitle { font-weight: 600; font-size: 0.9rem; }
    `,
  ],
})
export class ProductDetailPage {
  private readonly catalog = inject(CatalogService);
  private readonly cart = inject(CartFacade);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly wl = inject(WishlistService);

  product = signal<CatalogProduct | null>(null);
  error = signal(false);
  variant = signal<Variant | null>(null);
  mainImage = signal<string | null>(null);
  qty = signal(1);
  selected = signal<Record<string, string[]>>({});

  private lines = toSignal(this.cart.lines$, { initialValue: [] as CartLine[] });
  /** Quantity of the currently-selected variant already in the cart. */
  inCart = computed(() => this.lines().find((l) => l.variantSku === this.variant()?.sku)?.qty ?? 0);

  /** Category attributes (cuisine, veg, brand…) shown as labeled specs. */
  private attrValues = (): Record<string, unknown> =>
    (this.product() as unknown as { attributes?: Record<string, unknown> } | null)?.attributes ?? {};
  specs = computed(() => {
    const attrs = this.attrValues();
    // Skip the boolean "veg" attribute here — it's shown as the FSSAI symbol instead.
    return (this.product()?.attributeDefs ?? [])
      .filter((d) => !(d.type === 'boolean' && (d.key === 'veg' || d.label.toLowerCase().includes('veg'))))
      .map((d) => ({ key: d.key, label: d.label, type: d.type, value: attrs[d.key] }))
      .filter((s) => s.value !== undefined && s.value !== null && s.value !== '');
  });
  /** India veg / non-veg / egg marker — first-class foodType, else legacy `veg` attribute. */
  foodType = computed<FoodType | null>(() => {
    const p = this.product();
    return p ? foodTypeOf(p) : null;
  });
  ftLabel(ft: FoodType): string {
    return ft === 'veg' ? 'Pure Veg' : ft === 'non_veg' ? 'Non-veg' : 'Contains egg';
  }
  fmt(s: { type: string; value: unknown }): string {
    if (s.type === 'boolean') return s.value ? 'Yes' : 'No';
    return String(s.value);
  }

  soldOut = computed(() => (this.variant()?.stock ?? 0) === 0);
  livePrice = computed(() => {
    const v = this.variant();
    if (!v) return 0;
    const p = this.product();
    let total = v.price;
    for (const g of p?.modifierGroups ?? []) {
      for (const name of this.selected()[g.name] ?? []) {
        const opt = g.options.find((o) => o.name === name);
        if (opt) total += opt.priceDelta;
      }
    }
    return total;
  });
  variantAxisLabel = computed(() => {
    const first = this.product()?.variants?.[0];
    return first ? Object.keys(first.optionValues ?? {})[0] ?? 'Options' : '';
  });

  /** Re-fetch whenever the route slug changes — Angular reuses this component on same-route nav. */
  @Input() set slug(value: string) {
    if (!value) return;
    this.error.set(false);
    this.product.set(null);
    this.variant.set(null);
    this.mainImage.set(null);
    this.qty.set(1);
    this.selected.set({});
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    this.catalog.getProduct(value).subscribe({
      next: (p) => {
        this.product.set(p);
        this.variant.set(p.variants.find((v) => v.stock > 0) ?? p.variants[0] ?? null);
        this.mainImage.set(p.images[0] ?? null);
      },
      error: () => this.error.set(true),
    });
  }

  label(v: Variant): string { return Object.values(v.optionValues ?? {}).join(' / ') || v.sku; }
  emoji(p: { title: string }): string {
    const t = p.title.toLowerCase();
    if (t.includes('pizza')) return '🍕';
    if (t.includes('rice')) return '🍚';
    return '🛍️';
  }
  stars(n: number): string { const r = Math.round(n); return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r); }
  minPrice(p: CatalogProduct): number { return Math.min(...p.variants.map((v) => v.price)); }
  inc(): void { this.qty.update((q) => Math.min(q + 1, this.variant()?.stock ?? 99)); }
  dec(): void { this.qty.update((q) => Math.max(1, q - 1)); }

  isSelected(name: string): boolean { return Object.values(this.selected()).some((a) => a.includes(name)); }
  toggle(group: ModifierGroup, name: string): void {
    const cur = { ...this.selected() };
    const list = cur[group.name] ?? [];
    cur[group.name] = group.selection === 'single'
      ? (list.includes(name) ? [] : [name])
      : (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);
    this.selected.set(cur);
  }
  private modifierNames(): string[] { return Object.values(this.selected()).flat(); }

  toggleWish(p: CatalogProduct): void {
    if (!this.auth.isLoggedIn()) { void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } }); return; }
    this.wl.toggle(p._id);
  }

  private cartLine(p: CatalogProduct, qty: number): CartLine | null {
    const v = this.variant();
    if (!v) return null;
    return {
      productId: p._id, variantSku: v.sku, title: `${p.title} (${this.label(v)})`,
      slug: p.slug, image: p.images[0],
      storeId: p.storeId, storeName: p.store?.name, qty,
      unitPrice: this.livePrice(), modifierNames: this.modifierNames(),
    };
  }
  addToCart(p: CatalogProduct): void { const l = this.cartLine(p, this.qty()); if (l) this.cart.add(l); }
  incCart(p: CatalogProduct): void { const l = this.cartLine(p, 1); if (l) this.cart.add(l); }
  decCart(): void { const v = this.variant(); if (v) this.cart.setQty(v.sku, this.inCart() - 1); }
  buyNow(p: CatalogProduct): void {
    if (this.inCart() === 0) this.addToCart(p);
    void this.router.navigate(['/checkout']);
  }
}
