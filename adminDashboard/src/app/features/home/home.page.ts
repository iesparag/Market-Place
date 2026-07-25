import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HomeApi, type HomeSection } from './home.api';
import { CategoriesApi, type Category } from '../categories/categories.api';
import { ProductsApi } from '../products/services/products.api';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface Draft {
  _id?: string;
  title: string; subtitle: string;
  type: 'products' | 'vendors';
  source: 'auto' | 'curated';
  sort: string; category: string; limit: number; enabled: boolean;
  storeIds: string[];
}

/** Super-admin / admin: compose the customer landing page from ordered, toggleable sections. */
@Component({
  selector: 'app-home-admin',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="head"><div><h1>Home / Landing</h1><p class="muted">Sections shown on the customer homepage — reorder, toggle, and pick what appears.</p></div></header>

    <div class="cols">
      <!-- Sections list -->
      <div class="card list">
        <div class="lhead"><h3>Sections</h3><button class="btn btn-sm" (click)="newDraft()">+ Add section</button></div>
        @for (s of sections(); track s._id; let i = $index) {
          <div class="srow" [class.editing]="draft()._id === s._id" [class.off]="!s.enabled">
            <div class="sinfo">
              <div class="sname">{{ s.title }} <span class="badge">{{ s.type }}</span> <span class="badge alt">{{ s.source || 'auto' }}</span></div>
              <div class="muted xs">{{ describe(s) }}</div>
            </div>
            <div class="sactions">
              <button class="ic" [disabled]="i === 0" (click)="move(i, -1)" title="Up">↑</button>
              <button class="ic" [disabled]="i === sections().length - 1" (click)="move(i, 1)" title="Down">↓</button>
              <label class="switch"><input type="checkbox" [checked]="s.enabled" (change)="toggle(s)" /><span class="slider"></span></label>
              <button class="btn btn-ghost btn-sm" (click)="edit(s)">Edit</button>
              <button class="btn btn-ghost btn-sm del" (click)="del(s)">✕</button>
            </div>
          </div>
        } @empty { <p class="muted pad">No sections yet — customers see sensible defaults. Add one to customize.</p> }
      </div>

      <!-- Editor -->
      <div class="card editor">
        <div class="fhead"><h3>{{ draft()._id ? 'Edit section' : 'New section' }}</h3>
          @if (draft()._id) { <button class="btn btn-ghost btn-sm" (click)="newDraft()">New</button> }</div>

        <label class="label">Heading</label>
        <input class="input" [(ngModel)]="d.title" placeholder="e.g. ⭐ Top rated / Featured stores" />
        <label class="label">Subtitle (optional)</label>
        <input class="input" [(ngModel)]="d.subtitle" placeholder="short line under the heading" />

        <div class="two">
          <div><label class="label">Type</label>
            <select class="input" [(ngModel)]="d.type"><option value="products">Products</option><option value="vendors">Vendors / Shops</option></select>
          </div>
          <div><label class="label">Source</label>
            <select class="input" [(ngModel)]="d.source"><option value="auto">Auto (a rule)</option><option value="curated">Hand-picked</option></select>
          </div>
        </div>

        @if (d.type === 'products' && d.source === 'auto') {
          <div class="two">
            <div><label class="label">Sort by</label>
              <select class="input" [(ngModel)]="d.sort">
                <option value="popularity">Popular</option><option value="rating">Top rated</option>
                <option value="newest">Newest</option><option value="price_asc">Price ↑</option><option value="price_desc">Price ↓</option>
              </select>
            </div>
            <div><label class="label">Category (optional)</label>
              <select class="input" [(ngModel)]="d.category">
                <option value="">All categories</option>
                @for (c of flatCats(); track c._id) { <option [value]="c.slug">{{ c.indent }}{{ c.name }}</option> }
              </select>
            </div>
          </div>
        }

        @if (d.type === 'products' && d.source === 'curated') {
          <label class="label">Pick products <span class="muted xs">· {{ picked().length }} selected</span></label>
          <input class="input" [(ngModel)]="prodQuery" (ngModelChange)="searchProducts($event)" placeholder="Filter by title, code (MP-…) or brand — or just scroll" />
          <div class="checklist">
            @for (r of prodResults(); track r._id) {
              <label class="citem" [class.on]="isPicked(r._id)">
                <input type="checkbox" [checked]="isPicked(r._id)" (change)="togglePick(r)" />
                <span class="rcode">{{ r.code }}</span><span class="rttl">{{ r.title }}</span>
              </label>
            } @empty { <div class="muted xs pad">{{ prodLoading() ? 'Loading…' : 'No products found' }}</div> }
            @if (prodHasMore()) { <button type="button" class="loadmore" (click)="loadMoreProducts()">{{ prodLoading() ? 'Loading…' : 'Load more ↓' }}</button> }
          </div>
          @if (picked().length) {
            <div class="chips">
              @for (p of picked(); track p._id) { <span class="chip">{{ p.title }} <button (click)="removeProduct(p._id)">✕</button></span> }
            </div>
          }
        }

        @if (d.type === 'vendors' && d.source === 'curated') {
          <label class="label">Pick shops</label>
          <div class="vendors">
            @for (st of stores(); track st._id) {
              <label class="frow"><input type="checkbox" [checked]="d.storeIds.includes(st._id)" (change)="toggleStore(st._id)" /> {{ st.name }}</label>
            }
          </div>
        }

        <div class="two">
          <div><label class="label">Max items</label><input class="input" type="number" min="1" max="30" [(ngModel)]="d.limit" /></div>
          <div class="chkwrap"><label class="chk"><input type="checkbox" [(ngModel)]="d.enabled" /> Visible on homepage</label></div>
        </div>

        <button class="btn btn-primary save" [disabled]="saving() || !d.title" (click)="save()">{{ saving() ? 'Saving…' : (draft()._id ? 'Save changes' : 'Create section') }}</button>
      </div>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; align-items: start; }
      @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
      .list { padding: 0; overflow: hidden; }
      .lhead, .fhead { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--border); }
      .srow { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
      .srow.editing { box-shadow: inset 3px 0 0 var(--brand-600); } .srow.off { opacity: 0.6; }
      .sname { font-weight: 700; display: flex; align-items: center; gap: 8px; }
      .badge { background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; font-size: 0.68rem; padding: 1px 8px; font-weight: 600; text-transform: capitalize; }
      .badge.alt { color: var(--brand-700); }
      .xs { font-size: 0.75rem; } .pad { padding: 16px; }
      .sactions { display: flex; align-items: center; gap: 6px; }
      .ic { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; width: 26px; height: 26px; cursor: pointer; }
      .ic:disabled { opacity: 0.4; cursor: default; }
      .del:hover { color: var(--danger); }
      .editor { padding: 16px; } .label { margin-top: 10px; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .chkwrap { display: flex; align-items: flex-end; } .chk { display: inline-flex; gap: 8px; align-items: center; }
      .checklist { border: 1px solid var(--border); border-radius: 8px; margin-top: 6px; max-height: 260px; overflow-y: auto; }
      .citem { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border); cursor: pointer; font-size: 0.85rem; }
      .citem:hover { background: var(--surface-2); }
      .citem.on { background: var(--brand-50, #eef2ff); }
      .citem input { accent-color: var(--brand-600); }
      .rcode { font-family: ui-monospace, monospace; font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; }
      .rttl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .loadmore { width: 100%; text-align: center; padding: 9px; background: var(--surface-2); border: none; cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--brand-700); }
      .loadmore:hover { background: var(--border); }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .chip { background: var(--brand-50, #eef2ff); border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; }
      .chip button { background: none; border: none; cursor: pointer; color: var(--text-muted); }
      .vendors { max-height: 240px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; }
      .frow { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 0.9rem; }
      .switch { position: relative; display: inline-block; width: 38px; height: 20px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; inset: 0; background: var(--border); border-radius: 999px; cursor: pointer; transition: 0.2s; }
      .slider::before { content: ''; position: absolute; height: 14px; width: 14px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
      .switch input:checked + .slider { background: var(--success); }
      .switch input:checked + .slider::before { transform: translateX(18px); }
      .save { margin-top: 16px; }
    `,
  ],
})
export class HomeAdminPage implements OnInit {
  private readonly homeApi = inject(HomeApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  sections = signal<HomeSection[]>([]);
  flatCats = signal<{ _id: string; slug: string; name: string; indent: string }[]>([]);
  stores = signal<{ _id: string; name: string }[]>([]);
  saving = signal(false);
  draft = signal<Draft>(this.blank());
  picked = signal<{ _id: string; title: string; code?: string }[]>([]);
  prodQuery = '';
  prodResults = signal<{ _id: string; title: string; code?: string }[]>([]);
  prodLoading = signal(false);
  prodHasMore = signal(false);
  private prodPage = 1;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  /** ngModel needs a stable object reference — proxy to the draft signal. */
  get d(): Draft { return this.draft(); }

  blank(): Draft {
    return { title: '', subtitle: '', type: 'products', source: 'auto', sort: 'popularity', category: '', limit: 10, enabled: true, storeIds: [] };
  }

  ngOnInit(): void {
    this.load();
    this.categoriesApi.list().subscribe({ next: (c) => this.flatCats.set(this.flatten(c)) });
    this.api.get<{ _id: string; name: string }[]>('/stores').subscribe({ next: (s) => this.stores.set(s) });
    this.loadProducts(true); // browsable list ready for curated picking
  }

  /** Paginated, filterable product list for the curated multi-select. */
  loadProducts(reset: boolean): void {
    if (reset) this.prodPage = 1;
    this.prodLoading.set(true);
    this.productsApi.list({ q: this.prodQuery, page: this.prodPage, limit: 20 }).subscribe({
      next: (r) => {
        const rows = r.items.map((p) => ({ _id: p._id, title: p.title, code: p.code }));
        this.prodResults.set(reset ? rows : [...this.prodResults(), ...rows]);
        this.prodHasMore.set(r.page < r.pages);
        this.prodLoading.set(false);
      },
      error: () => this.prodLoading.set(false),
    });
  }
  loadMoreProducts(): void { this.prodPage += 1; this.loadProducts(false); }
  isPicked(id: string): boolean { return this.picked().some((p) => p._id === id); }
  togglePick(r: { _id: string; title: string; code?: string }): void {
    if (this.isPicked(r._id)) this.removeProduct(r._id);
    else this.picked.update((cur) => [...cur, r]);
  }

  load(): void { this.homeApi.list().subscribe({ next: (s) => this.sections.set(s) }); }

  private flatten(all: Category[]): { _id: string; slug: string; name: string; indent: string }[] {
    const out: { _id: string; slug: string; name: string; indent: string }[] = [];
    const walk = (parentId: string | null, depth: number): void => {
      for (const c of all.filter((x) => (x.parentId ?? null) === parentId)) {
        out.push({ _id: c._id, slug: c.slug, name: c.name, indent: '— '.repeat(depth) });
        walk(c._id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  describe(s: HomeSection): string {
    if (s.type === 'vendors') return s.source === 'curated' ? `${s.storeIds?.length ?? 0} shops picked` : `Top ${s.limit ?? 8} shops`;
    if (s.source === 'curated') return `${s.productIds?.length ?? 0} products picked`;
    return `${s.sort ?? 'popularity'}${s.category ? ' · ' + s.category : ''} · ${s.limit ?? 8} items`;
  }

  newDraft(): void { this.draft.set(this.blank()); this.picked.set([]); this.prodQuery = ''; this.loadProducts(true); }

  edit(s: HomeSection): void {
    this.draft.set({
      _id: s._id, title: s.title, subtitle: s.subtitle ?? '', type: s.type, source: s.source ?? 'auto',
      sort: s.sort ?? 'popularity', category: s.category ?? '', limit: s.limit ?? 10, enabled: s.enabled, storeIds: [...(s.storeIds ?? [])],
    });
    this.picked.set([]);
    // Resolve curated product labels (bounded list).
    for (const id of s.productIds ?? []) {
      this.productsApi.getOne(id).subscribe({ next: (p) => this.picked.update((cur) => [...cur, { _id: p._id, title: p.title, code: p.code }]) });
    }
  }

  searchProducts(q: string): void {
    this.prodQuery = q;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadProducts(true), 300);
  }
  removeProduct(id: string): void { this.picked.update((cur) => cur.filter((p) => p._id !== id)); }

  toggleStore(id: string): void {
    const cur = this.draft();
    const ids = cur.storeIds.includes(id) ? cur.storeIds.filter((x) => x !== id) : [...cur.storeIds, id];
    this.draft.set({ ...cur, storeIds: ids });
  }

  save(): void {
    const d = this.draft();
    this.saving.set(true);
    const body = {
      title: d.title, subtitle: d.subtitle, type: d.type, source: d.source,
      sort: d.sort, category: d.category, limit: Number(d.limit) || 8, enabled: d.enabled,
      productIds: d.type === 'products' && d.source === 'curated' ? this.picked().map((p) => p._id) : [],
      storeIds: d.type === 'vendors' && d.source === 'curated' ? d.storeIds : [],
    };
    const req = d._id ? this.homeApi.update(d._id, body) : this.homeApi.create(body);
    req.subscribe({
      next: () => { this.saving.set(false); this.notify.push('Saved', d.title, 'success'); this.newDraft(); this.load(); },
      error: (e) => { this.saving.set(false); this.notify.push('Failed', e?.message, 'warning'); },
    });
  }

  toggle(s: HomeSection): void {
    this.homeApi.update(s._id, { enabled: !s.enabled }).subscribe({ next: () => this.load() });
  }
  del(s: HomeSection): void {
    if (!confirm(`Delete section "${s.title}"?`)) return;
    this.homeApi.remove(s._id).subscribe({ next: () => { if (this.draft()._id === s._id) this.newDraft(); this.load(); } });
  }
  move(i: number, dir: -1 | 1): void {
    const arr = [...this.sections()];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    this.sections.set(arr);
    this.homeApi.reorder(arr.map((s) => s._id)).subscribe();
  }
}
