import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService, type CatalogProduct, type Banner, type CatNode, type HomeSectionView, type Vendor } from '../core/services/catalog.service';
import { ProductCardComponent } from '../shared/product-card.component';
import { BannerCarouselComponent } from '../shared/banner-carousel.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ProductCardComponent, BannerCarouselComponent],
  template: `
    <!-- Carousel shows ONLY when the admin has active banners; all off → nothing here. -->
    @if (banners().length) { <app-banner-carousel [banners]="banners()" /> }

    <!-- SHOP BY DEPARTMENT (top-level only; sub-categories as quick links) -->
    <section class="catsec">
      <div class="shead"><h2>Shop by department</h2><a routerLink="/stores" class="viewall">Browse all →</a></div>
      <div class="dgrid">
        @for (d of departments(); track d.slug; let i = $index) {
          <div class="dcard" [style.--tint]="tints[i % tints.length]">
            <a class="dtop" [routerLink]="['/catalog']" [queryParams]="{ category: deptSlugs(d) }">
              <span class="dicon">{{ emoji(d.slug) }}</span>
              <span class="dname">{{ d.name }}</span>
            </a>
            @if (d.children.length) {
              <div class="dsubs">
                @for (s of d.children.slice(0, 6); track s.slug) {
                  <a class="dsub" [routerLink]="['/catalog']" [queryParams]="{ category: subSlugs(d, s) }">{{ s.name }}</a>
                }
              </div>
            }
            <a class="dall" [routerLink]="['/catalog']" [queryParams]="{ category: deptSlugs(d) }">See all {{ d.name }} →</a>
          </div>
        } @empty { <p class="muted">No categories yet.</p> }
      </div>
    </section>

    <!-- Admin-composed sections (Home / Landing) -->
    @for (s of sections(); track s._id) {
      @if (s.type === 'products' && productsOf(s).length) {
        <section class="prow">
          <div class="rhead">
            <div><h2>{{ s.title }}</h2>@if (s.subtitle) { <p class="rsub muted">{{ s.subtitle }}</p> }</div>
            <a [routerLink]="['/catalog']" [queryParams]="viewAllParams(s)" class="viewall">View all →</a>
          </div>
          <div class="grid">@for (p of productsOf(s); track p._id) { <app-product-card [p]="p" /> }</div>
        </section>
      }
      @if (s.type === 'vendors' && vendorsOf(s).length) {
        <section class="prow">
          <div class="rhead"><div><h2>{{ s.title }}</h2>@if (s.subtitle) { <p class="rsub muted">{{ s.subtitle }}</p> }</div><a routerLink="/stores" class="viewall">All shops →</a></div>
          <div class="vgrid">
            @for (v of vendorsOf(s); track v._id) {
              <a class="vcard" [routerLink]="['/store', v.slug]">
                <span class="vlogo">@if (v.logo) { <img [src]="v.logo" [alt]="v.name" /> } @else { {{ v.name.charAt(0) }} }</span>
                <span class="vmeta"><span class="vname">{{ v.name }}</span><span class="muted xs">{{ v.productCount }} products · {{ v.vendorType }}</span></span>
              </a>
            }
          </div>
        </section>
      }
    }

    <!-- VENDOR CTA -->
    <section class="sell">
      <div>
        <h2>Sell on Marketplace</h2>
        <p class="muted">Reach thousands of customers. List your products, manage orders, get paid.</p>
      </div>
      <a routerLink="/become-vendor" class="btn btn-primary">Become a vendor</a>
    </section>
  `,
  styles: [
    `
      /* Hero */
      .hero { display: grid; grid-template-columns: 1.3fr 1fr; background: var(--brand-gradient); color: #fff; border-radius: var(--radius-lg); padding: 56px 48px; box-shadow: var(--shadow-lg); overflow: hidden; }
      .eyebrow { display: inline-block; background: rgba(255, 255, 255, 0.2); padding: 5px 13px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; margin-bottom: 14px; }
      .hleft h1 { font-size: 2.6rem; line-height: 1.08; } .hleft p { opacity: 0.95; margin-bottom: 24px; font-size: 1.05rem; max-width: 460px; }
      .hcta { display: flex; gap: 12px; flex-wrap: wrap; }
      .hero-cta { background: #fff; color: var(--brand-700); font-weight: 700; }
      .hero-ghost { background: rgba(255, 255, 255, 0.16); color: #fff; border-color: rgba(255, 255, 255, 0.35); }
      .hright { position: relative; }
      .float { position: absolute; font-size: 3rem; background: rgba(255, 255, 255, 0.16); border-radius: 20px; width: 96px; height: 96px; display: grid; place-items: center; box-shadow: var(--shadow); }
      .f1 { top: 6%; right: 34%; transform: rotate(-8deg); } .f2 { top: 34%; right: 6%; transform: rotate(6deg); }
      .f3 { bottom: 8%; right: 40%; transform: rotate(5deg); } .f4 { bottom: 18%; right: 12%; transform: rotate(-6deg); }
      @media (max-width: 820px) { .hero { grid-template-columns: 1fr; } .hright { display: none; } .hleft h1 { font-size: 2rem; } }

      /* Trust strip */
      .trust { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 22px; }
      @media (max-width: 760px) { .trust { grid-template-columns: 1fr 1fr; } }
      .tcard { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; display: flex; align-items: center; gap: 12px; }
      .tcard span { font-size: 1.6rem; } .tcard b { display: block; font-size: 0.95rem; } .tcard small { color: var(--text-muted); }

      /* Shop by department */
      .catsec { margin-top: 40px; }
      .shead, .rhead { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
      .shead h2, .rhead h2 { font-size: 1.5rem; } .viewall { font-weight: 600; font-size: 0.9rem; }
      .dgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
      .dcard { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; display: flex; flex-direction: column; transition: transform 0.15s, box-shadow 0.15s; }
      .dcard:hover { transform: translateY(-3px); box-shadow: var(--shadow); }
      .dtop { display: flex; align-items: center; gap: 14px; padding: 18px 20px; background: var(--tint, var(--brand-50)); text-decoration: none; }
      .dicon { font-size: 1.7rem; width: 54px; height: 54px; background: #fff; border-radius: 14px; display: grid; place-items: center; box-shadow: var(--shadow-sm); flex-shrink: 0; }
      .dname { font-weight: 800; font-size: 1.15rem; color: var(--ink); }
      .dsubs { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px 18px 8px; }
      .dsub { color: var(--text); font-size: 0.82rem; font-weight: 600; padding: 5px 12px; text-decoration: none; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; transition: all 0.12s; }
      .dsub:hover { background: var(--brand-600); color: #fff; border-color: var(--brand-600); }
      .dall { margin-top: auto; padding: 12px 20px 16px; color: var(--brand-700); font-weight: 700; font-size: 0.85rem; text-decoration: none; }
      .dall:hover { text-decoration: underline; }

      /* Product rows */
      .prow { margin-top: 42px; }
      .rsub { font-size: 0.9rem; margin-top: 2px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 18px; }

      /* Vendor cards */
      .vgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
      .vcard { display: flex; align-items: center; gap: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; text-decoration: none; color: var(--text); transition: transform 0.15s, box-shadow 0.15s; }
      .vcard:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
      .vlogo { width: 54px; height: 54px; border-radius: 14px; background: var(--brand-gradient); color: #fff; font-weight: 800; font-size: 1.4rem; display: grid; place-items: center; overflow: hidden; flex-shrink: 0; }
      .vlogo img { width: 100%; height: 100%; object-fit: cover; }
      .vmeta { display: flex; flex-direction: column; min-width: 0; }
      .vname { font-weight: 700; }
      .xs { font-size: 0.78rem; }

      /* Sell CTA */
      .sell { margin-top: 44px; background: var(--ink); color: #fff; border-radius: var(--radius-lg); padding: 34px 40px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
      .sell h2 { font-size: 1.5rem; } .sell p { color: #b7b7bd; }
    `,
  ],
})
export class HomeComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  banners = signal<Banner[]>([]);
  departments = signal<CatNode[]>([]);
  sections = signal<HomeSectionView[]>([]);
  tints = ['#fff1e6', '#e9f7ef', '#fdeef0', '#eef2ff', '#f3f0ff', '#fff7e6'];

  ngOnInit(): void {
    this.catalog.getBanners().subscribe({ next: (b) => this.banners.set(b) });
    this.catalog.getCategoryTree().subscribe({ next: (t) => this.departments.set(t) });
    this.catalog.getHome().subscribe({ next: (s) => this.sections.set(s) });
  }

  productsOf(s: HomeSectionView): CatalogProduct[] { return s.items as CatalogProduct[]; }
  vendorsOf(s: HomeSectionView): Vendor[] { return s.items as Vendor[]; }
  /** "View all" → catalog pre-filtered to the same rule (category + sort). */
  viewAllParams(s: HomeSectionView): Record<string, string> {
    const p: Record<string, string> = {};
    if (s.category) p['category'] = s.category;
    if (s.sort) p['sort'] = s.sort;
    return p;
  }

  emoji(slug: string): string {
    const map: Record<string, string> = {
      'food-beverages': '🍔', 'grocery-dept': '🛒', fashion: '👗',
      electronics: '📱', 'home-kitchen': '🍳', beauty: '💄',
    };
    return map[slug] ?? '🛍️';
  }

  /** A node's slug + every descendant slug (so filtering a branch shows all its products). */
  private allSlugs(n: CatNode): string[] {
    return [n.slug, ...n.children.flatMap((c) => this.allSlugs(c))];
  }
  /** Department click → ALL its sub-categories selected on the catalog page. */
  deptSlugs(d: CatNode): string {
    return d.children.flatMap((c) => this.allSlugs(c)).join(',');
  }
  /** Sub-category click → main department + that sub-category (and its own descendants). */
  subSlugs(d: CatNode, s: CatNode): string {
    return [d.slug, ...this.allSlugs(s)].join(',');
  }
}
