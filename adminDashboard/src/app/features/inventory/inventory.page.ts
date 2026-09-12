import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { matchesSearch } from '../../shared/search';

interface Variant { sku: string; optionValues: Record<string, string>; stock: number; price: number; }
interface Product { _id: string; title: string; variants: Variant[]; }

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="head"><h1>Inventory</h1><p class="muted">Adjust stock per variant — low stock is highlighted</p></header>
    <div class="toolbar">
      <input class="input search" [(ngModel)]="q" placeholder="Search by product or SKU…" />
      <span class="count muted">{{ filtered().length }} of {{ products().length }}</span>
    </div>
    <div class="card card--flush">
      <table class="table">
        <thead><tr><th>Product</th><th>Variant</th><th>SKU</th><th>Stock</th><th></th></tr></thead>
        <tbody>
          @for (p of filtered(); track p._id) {
            @for (v of p.variants; track v.sku) {
              <tr [class.low]="v.stock <= 5" [class.out]="v.stock === 0">
                <td>{{ p.title }}</td>
                <td>{{ label(v) }}</td>
                <td class="muted">{{ v.sku }}</td>
                <td>
                  <input class="input stock" type="number" [value]="v.stock" #inp />
                  @if (v.stock === 0) { <span class="badge badge-danger">out</span> }
                  @else if (v.stock <= 5) { <span class="badge badge-warning">low</span> }
                </td>
                <td class="actions"><button class="btn btn-sm" (click)="save(p, v, inp.value)">Save</button></td>
              </tr>
            }
          } @empty { <tr><td colspan="5" class="pad muted">{{ q ? 'No products match your search.' : 'No products.' }}</td></tr> }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
      .search { flex: 1; max-width: 360px; } .count { white-space: nowrap; }
      .stock { width: 90px; display: inline-block; margin-right: 8px; }
      .actions { text-align: right; } .pad { padding: 16px; }
      tr.low td { background: var(--warning-bg); }
      tr.out td { background: var(--danger-bg); }
    `,
  ],
})
export class InventoryPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  products = signal<Product[]>([]);
  q = '';

  filtered(): Product[] {
    return this.products().filter((p) => matchesSearch(this.q, p.title, ...p.variants.flatMap((v) => [v.sku, this.label(v)])));
  }

  ngOnInit(): void { this.load(); }
  load(): void { this.api.get<Product[]>('/products').subscribe({ next: (p) => this.products.set(p) }); }
  label(v: Variant): string { return Object.values(v.optionValues ?? {}).join(' / ') || v.sku; }

  save(p: Product, v: Variant, value: string): void {
    const stock = Math.max(0, Number(value) || 0);
    this.api.patch(`/products/${p._id}/stock`, { variantSku: v.sku, stock }).subscribe({
      next: () => { this.notify.push('Stock updated', `${p.title} · ${v.sku} → ${stock}`, 'success'); this.load(); },
      error: (e) => this.notify.push('Failed', e?.message, 'warning'),
    });
  }
}
