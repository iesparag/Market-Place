import { Component, inject, OnInit } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { ProductsFacade } from '../store/products.facade';
import { ProductsApi, type ProductRow } from '../services/products.api';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-products-list',
  standalone: true,
  imports: [AsyncPipe, RouterLink, HasPermissionDirective],
  template: `
    <header class="head">
      <div>
        <h1>Products</h1>
        <p class="muted">Manage catalog & stock — toggle a product on/off to show/hide it in the store</p>
      </div>
      <a class="btn btn-primary" routerLink="/products/new" *hasPermission="'product:create'">+ New product</a>
    </header>

    <div class="card card--flush">
      @if (facade.loading$ | async) { <p class="pad muted">Loading…</p> }
      <table class="table">
        <thead>
          <tr><th>Title</th><th>Vendor</th><th>Live</th><th>Variants</th><th>Stock</th><th></th></tr>
        </thead>
        <tbody>
          @for (p of facade.products$ | async; track p._id) {
            <tr [class.off]="p.status !== 'active'">
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
            <tr><td colspan="6" class="pad muted">No products yet. Click “New product”.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .head h1 { margin-bottom: 2px; }
      .pad { padding: 16px; }
      .actions { text-align: right; white-space: nowrap; }
      .del:hover { color: var(--danger); }
      tr.off td { opacity: 0.55; }
      td.low { color: var(--danger); font-weight: 700; }
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
  readonly facade = inject(ProductsFacade);
  private readonly api = inject(ProductsApi);
  private readonly notify = inject(NotificationService);

  ngOnInit(): void {
    this.facade.load();
  }

  totalStock(p: { variants: { stock: number }[] }): number {
    return p.variants.reduce((n, v) => n + (v.stock ?? 0), 0);
  }

  toggle(p: ProductRow, e: Event): void {
    const active = (e.target as HTMLInputElement).checked;
    this.api.publish(p._id, active).subscribe({
      next: () => {
        this.notify.push(active ? 'Product turned ON' : 'Product turned OFF', p.title, active ? 'success' : 'warning');
        this.facade.load();
      },
      error: (err) => this.notify.push('Failed', err?.message, 'warning'),
    });
  }

  remove(id: string): void {
    if (!confirm('Delete this product?')) return;
    this.api.remove(id).subscribe({ next: () => this.facade.load() });
  }
}
