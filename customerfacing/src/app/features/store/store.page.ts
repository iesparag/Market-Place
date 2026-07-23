import { Component, computed, inject, Input, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogService, type CatalogProduct, type CatNode, type StoreProfile } from '../../core/services/catalog.service';
import { ProductCardComponent } from '../../shared/product-card.component';
import { CategoryNavComponent } from '../../shared/category-nav.component';

/** Public vendor storefront — big-brand style: cover carousel + logo + About + store-scoped catalog. */
@Component({
  selector: 'app-store',
  standalone: true,
  imports: [RouterLink, ProductCardComponent, CategoryNavComponent],
  template: `
    @if (store(); as s) {
      <nav class="crumb muted"><a routerLink="/">Home</a> › <a routerLink="/stores">Stores</a> › <span>{{ s.name }}</span></nav>

      <!-- Cover carousel -->
      <div class="cover" [class.grad]="!covers().length">
        @for (img of covers(); track img; let i = $index) {
          <img class="cimg" [class.on]="i === coverIdx()" [src]="img" alt="" />
        }
        @if (covers().length > 1) {
          <div class="dots">@for (img of covers(); track img; let i = $index) { <span [class.on]="i === coverIdx()" (click)="coverIdx.set(i)"></span> }</div>
        }
      </div>

      <!-- Header -->
      <section class="shead card">
        <div class="logo">@if (s.logo) { <img [src]="s.logo" [alt]="s.name" /> } @else { <span>{{ s.name.slice(0, 1) }}</span> }</div>
        <div class="hmain">
          <div class="hrow"><h1>{{ s.name }}</h1><span class="vbadge">✓ Verified seller</span></div>
          <div class="meta muted">
            <span class="cap">{{ s.vendorType }}</span>
            @if (s.ratingCount) { <span>· ★ {{ (s.ratingAvg ?? 0).toFixed(1) }} ({{ s.ratingCount }})</span> }
            <span>· {{ allProducts().length }} products</span>
            @if (s.establishedYear) { <span>· Since {{ s.establishedYear }}</span> }
          </div>
          @if (s.description) { <p class="desc">{{ s.description }}</p> }
          <div class="links">
            @if (s.website) { <a [href]="s.website" target="_blank" rel="noopener">🌐 Website</a> }
            @if (s.social?.instagram) { <a [href]="s.social!.instagram" target="_blank" rel="noopener">📸 Instagram</a> }
            @if (s.contactPhone) { <span>📞 {{ s.contactPhone }}</span> }
          </div>
        </div>
      </section>

      <!-- About / business details -->
      @if (hasAbout(s)) {
        <section class="about card">
          <h3>About {{ s.name }}</h3>
          <div class="agrid">
            @if (addressLine(s)) { <div class="ai"><span class="ak">📍 Address</span><span class="av">{{ addressLine(s) }}</span></div> }
            @if (s.legalName) { <div class="ai"><span class="ak">🏢 Legal name</span><span class="av">{{ s.legalName }}</span></div> }
            @if (s.gstin) { <div class="ai"><span class="ak">🧾 GSTIN</span><span class="av">{{ s.gstin }}</span></div> }
            @if (s.contactEmail) { <div class="ai"><span class="ak">✉️ Email</span><span class="av">{{ s.contactEmail }}</span></div> }
            @if (s.contactPhone) { <div class="ai"><span class="ak">📞 Phone</span><span class="av">{{ s.contactPhone }}</span></div> }
          </div>
        </section>
      }

      @if (tree().length) {
        <div class="storenav card"><app-category-nav [tree]="tree()" [routerPath]="storePath()" /></div>
      }
      @if (activeCat(); as ac) {
        <div class="chips"><span class="showing">Showing:</span><a class="chip" [routerLink]="storePath()">{{ ac }} ✕</a></div>
      }

      <div class="grid">
        @for (p of filtered(); track p._id) { <app-product-card [p]="p" /> }
        @empty { <p class="muted">No products in this category. <a [routerLink]="storePath()">View all</a></p> }
      </div>
    } @else if (error()) {
      <div class="card">Store not found. <a routerLink="/catalog">Browse catalog</a></div>
    } @else { <div class="card muted">Loading store…</div> }
  `,
  styles: [
    `
      .crumb { margin-bottom: 14px; font-size: 0.85rem; } .crumb a { color: var(--text-muted); }
      .cover { position: relative; height: 240px; border-radius: var(--radius-lg); overflow: hidden; background: #e8eef2; }
      .cover.grad { background: var(--brand-gradient); }
      .cimg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.6s ease; }
      .cimg.on { opacity: 1; }
      .dots { position: absolute; bottom: 12px; left: 0; right: 0; display: flex; justify-content: center; gap: 7px; z-index: 2; }
      .dots span { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.55); cursor: pointer; }
      .dots span.on { background: #fff; width: 22px; border-radius: 5px; }

      .shead { display: flex; gap: 20px; align-items: flex-start; margin-top: -46px; position: relative; z-index: 3; }
      .logo { width: 92px; height: 92px; border-radius: 20px; background: #fff; border: 3px solid #fff; box-shadow: var(--shadow); display: grid; place-items: center; font-size: 2.4rem; font-weight: 800; color: var(--brand-700); overflow: hidden; flex: none; margin-top: -30px; }
      .logo img { width: 100%; height: 100%; object-fit: cover; }
      .hmain { flex: 1; min-width: 0; }
      .hrow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; } .hrow h1 { margin: 0; }
      .vbadge { background: #e7f8ee; color: #15803d; border: 1px solid #86efac; font-weight: 700; font-size: 0.72rem; padding: 2px 9px; border-radius: 999px; }
      .meta { display: flex; gap: 6px; flex-wrap: wrap; font-size: 0.88rem; margin-top: 4px; } .cap { text-transform: capitalize; }
      .desc { margin: 8px 0; color: var(--text-muted); max-width: 720px; }
      .links { display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.88rem; margin-top: 4px; } .links a { color: var(--brand-700); font-weight: 600; }

      .about { margin-top: 16px; } .about h3 { margin-bottom: 12px; }
      .agrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
      .ai { display: flex; flex-direction: column; gap: 2px; } .ak { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
      .av { font-weight: 600; font-size: 0.92rem; }

      .storenav { padding: 2px 12px; margin: 18px 0; }
      .chips { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
      .showing { font-size: 0.85rem; color: var(--text-muted); }
      .chip { background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 5px 12px; font-size: 0.82rem; font-weight: 600; color: var(--text); }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 20px; }
    `,
  ],
})
export class StorePage {
  private readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private slugValue = '';
  store = signal<StoreProfile | null>(null);
  allProducts = signal<CatalogProduct[]>([]);
  tree = signal<CatNode[]>([]);
  selectedCat = signal<string>('');
  error = signal(false);
  coverIdx = signal(0);

  storePath = computed(() => ['/store', this.slugValue]);
  covers = computed(() => {
    const s = this.store();
    if (s?.coverImages?.length) return s.coverImages;
    return s?.banner ? [s.banner] : [];
  });

  private selectedSlugs = computed(() => this.selectedCat().split(',').map((x) => x.trim()).filter(Boolean));
  activeCat = computed(() => {
    const slugs = this.selectedSlugs();
    return slugs.length ? this.findNode(this.tree(), slugs[0]!)?.name ?? '' : '';
  });
  filtered = computed(() => {
    const slugs = this.selectedSlugs();
    if (!slugs.length) return this.allProducts();
    const ids = new Set<string>();
    for (const slug of slugs) { const n = this.findNode(this.tree(), slug); if (n) this.collectIds(n, ids); }
    return this.allProducts().filter((p) => p.categoryId && ids.has(String(p.categoryId)));
  });

  constructor() {
    this.route.queryParamMap.subscribe((p) => this.selectedCat.set(p.get('category') ?? ''));
    if (this.browser) {
      setInterval(() => { const n = this.covers().length; if (n > 1) this.coverIdx.update((i) => (i + 1) % n); }, 5000);
    }
  }

  @Input() set slug(value: string) {
    if (!value) return;
    this.slugValue = value;
    this.store.set(null);
    this.error.set(false);
    this.coverIdx.set(0);
    this.catalog.getStore(value).subscribe({
      next: (r) => { this.store.set(r.store); this.allProducts.set(r.products); this.tree.set(r.categoryTree ?? []); },
      error: () => this.error.set(true),
    });
  }

  hasAbout(s: StoreProfile): boolean {
    return !!(this.addressLine(s) || s.gstin || s.legalName || s.contactEmail || s.contactPhone);
  }
  addressLine(s: StoreProfile): string {
    const a = s.address;
    if (!a) return '';
    return [a.line1, a.city, a.state, a.pincode].filter(Boolean).join(', ');
  }

  private findNode(nodes: CatNode[], slug: string): CatNode | null {
    for (const n of nodes) {
      if (n.slug === slug) return n;
      const hit = this.findNode(n.children, slug);
      if (hit) return hit;
    }
    return null;
  }
  private collectIds(node: CatNode, out: Set<string>): void {
    out.add(node._id);
    for (const c of node.children) this.collectIds(c, out);
  }
}
