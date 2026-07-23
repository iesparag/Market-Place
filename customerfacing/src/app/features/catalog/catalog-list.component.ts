import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CatalogService, type CatalogProduct } from '../../core/services/catalog.service';
import { ProductCardComponent } from '../../shared/product-card.component';
import { VegMarkComponent } from '../../shared/veg-mark.component';

interface PriceBand { label: string; min?: number; max?: number; }

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [ProductCardComponent, VegMarkComponent],
  template: `
    <div class="layout">
      <!-- Filters -->
      <aside class="filters card">
        <div class="fhead"><h3>Filters</h3><button class="btn btn-ghost btn-sm" (click)="clear()">Clear all</button></div>

        <div class="fgroup">
          <div class="ftitle">Food preference</div>
          <label class="frow veg"><input type="checkbox" [checked]="vegOnly()" (change)="toggleVeg()" /> <app-veg-mark type="veg" [size]="14" /> Veg only</label>
        </div>

        <div class="fgroup">
          <div class="ftitle">Category @if (selectedCats().length) { <span class="cnt">{{ selectedCats().length }}</span> }</div>
          <input class="input catsearch" placeholder="Search categories…" (input)="onCatSearch($event)" />
          <div class="catlist">
            @for (c of filteredCats(); track c.slug) {
              <label class="frow"><input type="checkbox" [checked]="isSelected(c.slug)" (change)="toggleCat(c.slug)" /> {{ c.name }}</label>
            } @empty { <div class="muted small">No categories</div> }
          </div>
        </div>

        <div class="fgroup">
          <div class="ftitle">Price</div>
          @for (b of bands; track b.label; let i = $index) {
            <label class="frow"><input type="radio" name="price" [checked]="bandIndex() === i" (change)="setBand(i)" /> {{ b.label }}</label>
          }
          <label class="frow"><input type="radio" name="price" [checked]="bandIndex() === -1" (change)="setBand(-1)" /> Any price</label>
        </div>

        <div class="fgroup">
          <div class="ftitle">Customer rating</div>
          @for (r of [4, 3]; track r) {
            <label class="frow"><input type="radio" name="rate" [checked]="ratingMin() === r" (change)="setRating(r)" />
              <span class="stars">{{ '★★★★★'.slice(0, r) }}</span> & up</label>
          }
          <label class="frow"><input type="radio" name="rate" [checked]="ratingMin() === 0" (change)="setRating(0)" /> Any rating</label>
        </div>
      </aside>

      <!-- Results -->
      <div class="results">
        <div class="topbar">
          <div>
            <h1>{{ heading() }}</h1>
            <span class="muted">{{ products().length }}{{ canLoadMore() ? '+' : '' }} results</span>
          </div>
          <label class="sortby">
            Sort:
            <select class="input" [value]="sort()" (change)="setSort($event)">
              <option value="popularity">Popularity</option>
              <option value="rating">Avg. customer review</option>
              <option value="newest">Newest arrivals</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </label>
        </div>

        <!-- Active category chips (multi-select) -->
        @if (selectedCats().length) {
          <div class="chips">
            @for (slug of selectedCats(); track slug) {
              <button class="chip" (click)="toggleCat(slug)">{{ catName(slug) }} ✕</button>
            }
            <button class="chip clear" (click)="clearCats()">Clear categories</button>
          </div>
        }

        @if (loading()) { <p class="muted">Loading…</p> }

        <div class="grid">
          @for (p of products(); track p._id) { <app-product-card [p]="p" /> }
          @empty { @if (!loading()) { <div class="card empty muted">No products match these filters. <button class="btn btn-sm" (click)="clear()">Clear filters</button></div> } }
        </div>

        @if (canLoadMore()) { <div class="more"><button class="btn" [disabled]="loading()" (click)="loadMore()">Load more</button></div> }
      </div>
    </div>
  `,
  styles: [
    `
      .layout { display: grid; grid-template-columns: 260px 1fr; gap: 24px; align-items: start; }
      @media (max-width: 820px) { .layout { grid-template-columns: 1fr; } .filters { position: static; } }
      .filters { position: sticky; top: 130px; }
      .fhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .fgroup { padding: 14px 0; border-top: 1px solid var(--border); }
      .ftitle { font-weight: 700; font-size: 0.9rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
      .cnt { background: var(--brand-600); color: #fff; border-radius: 999px; font-size: 0.7rem; min-width: 18px; height: 18px; display: inline-grid; place-items: center; padding: 0 5px; }
      .catsearch { padding: 8px 10px; margin-bottom: 8px; font-size: 0.85rem; }
      .catlist { max-height: 260px; overflow-y: auto; padding-right: 4px; }
      .frow { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 0.9rem; cursor: pointer; }
      .frow input { accent-color: var(--brand-600); }
      .frow.veg { gap: 8px; font-weight: 600; }
      .small { font-size: 0.82rem; padding: 4px 0; }
      .stars { color: var(--star); }
      .topbar { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px; }
      .topbar h1 { margin-bottom: 2px; font-size: 1.35rem; }
      .sortby { font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
      .sortby .input { width: auto; padding: 8px 10px; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
      .chip { background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 5px 12px; font-size: 0.82rem; font-weight: 600; cursor: pointer; color: var(--text); }
      .chip:hover { border-color: var(--brand-600); color: var(--brand-700); }
      .chip.clear { background: none; color: var(--text-muted); }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 18px; }
      .empty { grid-column: 1 / -1; text-align: center; padding: 40px; }
      .more { text-align: center; margin-top: 26px; }
    `,
  ],
})
export class CatalogListComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly limit = 12;

  bands: PriceBand[] = [
    { label: 'Under ₹200', max: 20000 },
    { label: '₹200 – ₹500', min: 20000, max: 50000 },
    { label: '₹500 – ₹1000', min: 50000, max: 100000 },
    { label: 'Over ₹1000', min: 100000 },
  ];

  products = signal<CatalogProduct[]>([]);
  categories = signal<{ name: string; slug: string }[]>([]);
  loading = signal(true);
  canLoadMore = signal(false);
  selectedCats = signal<string[]>([]);
  ratingMin = signal(0);
  bandIndex = signal(-1);
  vegOnly = signal(false);
  sort = signal('popularity');
  private catQuery = signal('');
  private page = 1;
  private q = '';

  filteredCats = computed(() => {
    const term = this.catQuery().toLowerCase();
    const list = this.categories();
    return term ? list.filter((c) => c.name.toLowerCase().includes(term)) : list;
  });

  heading = () => {
    if (this.q) return `Results for “${this.q}”`;
    const sel = this.selectedCats();
    if (sel.length === 1) return this.catName(sel[0]!);
    if (sel.length > 1) return `${sel.length} categories`;
    return 'All products';
  };

  ngOnInit(): void {
    this.catalog.getCategories().subscribe({ next: (c) => this.categories.set(c) });
    this.route.queryParamMap.subscribe((params) => {
      this.q = params.get('q') ?? '';
      const cat = params.get('category');
      this.selectedCats.set(cat ? cat.split(',').filter(Boolean) : []);
      if (params.get('sort')) this.sort.set(params.get('sort')!);
      this.load(true);
    });
  }

  private load(reset: boolean): void {
    if (reset) this.page = 1;
    this.loading.set(true);
    const band = this.bandIndex() >= 0 ? this.bands[this.bandIndex()] : undefined;
    this.catalog
      .listProducts({
        q: this.q || undefined,
        category: this.selectedCats().join(',') || undefined,
        sort: this.sort(),
        priceMin: band?.min, priceMax: band?.max, ratingMin: this.ratingMin() || undefined,
        veg: this.vegOnly() || undefined,
        page: this.page, limit: this.limit,
      })
      .subscribe({
        next: (list) => {
          this.products.set(reset ? list : [...this.products(), ...list]);
          this.canLoadMore.set(list.length === this.limit);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  isSelected(slug: string): boolean { return this.selectedCats().includes(slug); }
  catName(slug: string): string { return this.categories().find((c) => c.slug === slug)?.name ?? slug; }

  toggleCat(slug: string): void {
    const cur = this.selectedCats();
    this.selectedCats.set(cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]);
    this.load(true);
  }
  clearCats(): void { this.selectedCats.set([]); this.load(true); }
  loadMore(): void { this.page += 1; this.load(false); }
  setBand(i: number): void { this.bandIndex.set(i); this.load(true); }
  setRating(r: number): void { this.ratingMin.set(r); this.load(true); }
  toggleVeg(): void { this.vegOnly.set(!this.vegOnly()); this.load(true); }
  setSort(e: Event): void { this.sort.set((e.target as HTMLSelectElement).value); this.load(true); }
  onCatSearch(e: Event): void { this.catQuery.set((e.target as HTMLInputElement).value.trim()); }
  clear(): void { this.selectedCats.set([]); this.bandIndex.set(-1); this.ratingMin.set(0); this.vegOnly.set(false); this.q = ''; this.sort.set('popularity'); this.catQuery.set(''); this.load(true); }
}
