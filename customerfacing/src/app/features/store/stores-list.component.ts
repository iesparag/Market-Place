import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService, type Vendor } from '../../core/services/catalog.service';

/** Myntra-style vendor directory — browse every store, click into any one. */
@Component({
  selector: 'app-stores-list',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav class="crumb muted"><a routerLink="/">Home</a> › <span>Stores</span></nav>
    <header class="head">
      <h1>Shop by store</h1>
      <p class="muted">Browse all vendors on Marketplace</p>
      <input class="input search" placeholder="Search stores…" (input)="onSearch($event)" />
    </header>

    @if (loading()) { <p class="muted">Loading stores…</p> }

    <div class="grid">
      @for (s of filtered(); track s._id) {
        <a class="card store" [routerLink]="['/store', s.slug]">
          <div class="cover" [style.background]="cover(s)">
            <div class="avatar">{{ s.logo ? '' : s.name.slice(0, 1) }}
              @if (s.logo) { <img [src]="s.logo" [alt]="s.name" /> }
            </div>
          </div>
          <div class="body">
            <div class="name">{{ s.name }}</div>
            <div class="muted type">{{ s.vendorType }}</div>
            <p class="desc muted">{{ s.description || 'Products from this vendor' }}</p>
            <div class="meta">
              <span class="badge">{{ s.productCount }} products</span>
              @if (s.ratingCount) { <span class="rate">★ {{ (s.ratingAvg ?? 0).toFixed(1) }}</span> }
            </div>
          </div>
        </a>
      } @empty { @if (!loading()) { <p class="muted">No stores found.</p> } }
    </div>
  `,
  styles: [
    `
      .crumb { margin-bottom: 14px; font-size: 0.85rem; } .crumb a { color: var(--text-muted); }
      .head { margin-bottom: 22px; } .head h1 { margin-bottom: 2px; }
      .search { max-width: 320px; margin-top: 12px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
      .store { padding: 0; overflow: hidden; text-decoration: none; transition: transform 0.15s, box-shadow 0.15s; }
      .store:hover { transform: translateY(-4px); box-shadow: var(--shadow); }
      .cover { height: 84px; position: relative; }
      .avatar { position: absolute; left: 20px; bottom: -26px; width: 60px; height: 60px; border-radius: 16px; background: #fff; border: 3px solid #fff; box-shadow: var(--shadow); display: grid; place-items: center; font-weight: 800; font-size: 1.5rem; color: var(--brand-700); overflow: hidden; }
      .avatar img { width: 100%; height: 100%; object-fit: cover; }
      .body { padding: 34px 20px 18px; }
      .name { font-weight: 800; font-size: 1.1rem; } .type { font-size: 0.8rem; text-transform: capitalize; }
      .desc { font-size: 0.88rem; margin: 8px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .meta { display: flex; align-items: center; gap: 10px; } .rate { color: var(--star); font-weight: 600; font-size: 0.88rem; }
    `,
  ],
})
export class StoresListComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly covers = ['#ffe3d0', '#d7f2e3', '#ffd9dd', '#e3e8ff', '#efe3ff', '#fff0d6'];
  stores = signal<Vendor[]>([]);
  loading = signal(true);
  q = signal('');

  filtered = () => {
    const term = this.q().toLowerCase();
    return term ? this.stores().filter((s) => s.name.toLowerCase().includes(term)) : this.stores();
  };

  ngOnInit(): void {
    this.catalog.getStores().subscribe({
      next: (s) => { this.stores.set(s); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onSearch(e: Event): void { this.q.set((e.target as HTMLInputElement).value.trim()); }
  cover(s: Vendor): string {
    let h = 0;
    for (const ch of s.slug) h = (h + ch.charCodeAt(0)) % this.covers.length;
    return this.covers[h] ?? this.covers[0]!;
  }
}
