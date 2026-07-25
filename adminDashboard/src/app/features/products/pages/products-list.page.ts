import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { ProductsApi, type ProductRow } from '../services/products.api';
import { CategoriesApi, type Category } from '../../categories/categories.api';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-products-list',
  standalone: true,
  imports: [RouterLink, HasPermissionDirective],
  template: `
    <header class="head">
      <div>
        <h1>Products</h1>
        <p class="muted">Manage catalog & stock — toggle a product on/off to show/hide it in the store</p>
      </div>
      <a class="btn btn-primary" routerLink="/products/new" *hasPermission="'product:create'">+ New product</a>
    </header>

    <div class="toolbar">
      <input class="input search" placeholder="Search by title, code (MP-…) or brand" [value]="q()" (input)="onSearch($any($event.target).value)" />
      <select class="input cat" [value]="categoryId()" (change)="onCategory($any($event.target).value)">
        <option value="">All categories</option>
        @for (c of flatCats(); track c._id) { <option [value]="c._id">{{ c.indent }}{{ c.name }}</option> }
      </select>
      <span class="count muted">{{ total() }} products</span>
    </div>

    <div class="card card--flush">
      @if (loading()) { <p class="pad muted">Loading…</p> }
      <table class="table">
        <thead>
          <tr><th>Code</th><th>Title</th><th>Vendor</th><th>Live</th><th>Variants</th><th>Stock</th><th></th></tr>
        </thead>
        <tbody>
          @for (p of rows(); track p._id) {
            <tr [class.off]="p.status !== 'active'">
              <td class="code">{{ p.code || '—' }}</td>
              <td>{{ p.title }}</td>
              <td>
                {{ p.store?.name || '—' }}
                @if (p.store && p.store.status !== 'approved') { <span class="badge badge-danger">{{ p.store.status }}</span> }
              </td>
              <td>
                <label class="switch" *hasPermission="'product:update'">
                  <input type="checkbox" [checked]="p.status === 'active'" (change)="toggle(p, $event)" />
                  <span class="slider"></span>
                </label>
                @if (p.status !== 'active') { <span class="badge badge-warning">off</span> }
              </td>
              <td>{{ p.variants.length }}</td>
              <td [class.low]="totalStock(p) === 0">{{ totalStock(p) }}</td>
              <td class="actions">
                <a class="btn btn-ghost btn-sm" [routerLink]="['/products', p._id, 'edit']" *hasPermission="'product:update'">Edit</a>
                <button class="btn btn-ghost btn-sm del" (click)="remove(p._id)" *hasPermission="'product:delete'">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="pad muted">{{ loading() ? '' : 'No products found.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (pages() > 1) {
      <div class="pager">
        <button class="btn btn-ghost btn-sm" [disabled]="page() <= 1" (click)="go(page() - 1)">← Prev</button>
        <span class="muted">Page {{ page() }} of {{ pages() }}</span>
        <button class="btn btn-ghost btn-sm" [disabled]="page() >= pages()" (click)="go(page() + 1)">Next →</button>
      </div>
    }
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .head h1 { margin-bottom: 2px; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
      .search { flex: 1; min-width: 220px; } .cat { max-width: 240px; } .count { white-space: nowrap; }
      .pad { padding: 16px; }
      .code { font-family: ui-monospace, monospace; font-size: 0.82rem; color: var(--text-muted); white-space: nowrap; }
      .actions { text-align: right; white-space: nowrap; }
      .del:hover { color: var(--danger); }
      tr.off td { opacity: 0.55; }
      td.low { color: var(--danger); font-weight: 700; }
      .pager { display: flex; gap: 14px; align-items: center; justify-content: center; margin-top: 16px; }
      .switch { position: relative; display: inline-block; width: 40px; height: 22px; vertical-align: middle; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; inset: 0; background: var(--border); border-radius: 999px; transition: 0.2s; cursor: pointer; }
      .slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
      .switch input:checked + .slider { background: var(--success); }
      .switch input:checked + .slider::before { transform: translateX(18px); }
    `,
  ],
})
export class ProductsListPage implements OnInit {
  private readonly api = inject(ProductsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly notify = inject(NotificationService);

  rows = signal<ProductRow[]>([]);
  total = signal(0);
  page = signal(1);
  pages = signal(1);
  loading = signal(false);
  q = signal('');
  categoryId = signal('');
  flatCats = signal<{ _id: string; name: string; indent: string }[]>([]);
  private readonly limit = 20;
  private debounce: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.categoriesApi.list().subscribe({ next: (c) => this.flatCats.set(this.flatten(c)) });
    this.load();
  }

  /** Categories in tree order with indentation (for the filter dropdown). */
  private flatten(all: Category[]): { _id: string; name: string; indent: string }[] {
    const out: { _id: string; name: string; indent: string }[] = [];
    const walk = (parentId: string | null, depth: number): void => {
      for (const c of all.filter((x) => (x.parentId ?? null) === parentId)) {
        out.push({ _id: c._id, name: c.name, indent: '— '.repeat(depth) });
        walk(c._id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  load(): void {
    this.loading.set(true);
    this.api.list({ page: this.page(), limit: this.limit, q: this.q(), category: this.categoryId() }).subscribe({
      next: (res) => {
        this.rows.set(res.items);
        this.total.set(res.total);
        this.pages.set(res.pages);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSearch(v: string): void {
    this.q.set(v);
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => { this.page.set(1); this.load(); }, 350);
  }
  onCategory(v: string): void { this.categoryId.set(v); this.page.set(1); this.load(); }
  go(p: number): void { this.page.set(p); this.load(); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); }

  totalStock(p: { variants: { stock: number }[] }): number {
    return p.variants.reduce((n, v) => n + (v.stock ?? 0), 0);
  }

  toggle(p: ProductRow, e: Event): void {
    const active = (e.target as HTMLInputElement).checked;
    this.api.publish(p._id, active).subscribe({
      next: () => this.notify.push(active ? 'Product turned ON' : 'Product turned OFF', p.title, active ? 'success' : 'warning'),
      error: (err) => this.notify.push('Failed', err?.message, 'warning'),
    });
  }

  remove(id: string): void {
    if (!confirm('Delete this product?')) return;
    this.api.remove(id).subscribe({ next: () => this.load() });
  }
}
