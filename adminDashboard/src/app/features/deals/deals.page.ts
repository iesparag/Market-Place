import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { ProductsApi, type ProductRow } from '../products/services/products.api';

interface Promotion {
  _id: string;
  productId: string;
  product: { title: string; slug: string; images?: string[] } | null;
  discountPercent: number;
  validFrom: string;
  validTo: string;
  active: boolean;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Admin-managed "Deals of the Day" — replaces the old fabricated round-robin discount
 * shown on the home feed. Each row is a real scheduled discount on one product; the
 * home feed (home.module.ts) only ever shows products with a currently-active row here,
 * and the countdown shown to customers is the real soonest validTo among them. */
@Component({
  selector: 'app-deals',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, DatePipe],
  template: `
    <header class="head"><h1>Deals of the Day</h1><p class="muted">Scheduled discounts shown on the home feed — real countdown, real %</p></header>
    <div class="cols">
      <div class="card card--flush list">
        <table class="table">
          <thead><tr><th>Product</th><th>Discount</th><th>Window</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (p of promotions(); track p._id) {
              <tr>
                <td><b>{{ p.product?.title ?? '(deleted product)' }}</b></td>
                <td>{{ p.discountPercent }}%</td>
                <td class="muted small">{{ p.validFrom | date: 'MMM d, h:mm a' }} → {{ p.validTo | date: 'MMM d, h:mm a' }}</td>
                <td><span class="badge" [class.badge-success]="isLive(p)">{{ isLive(p) ? 'live' : (p.active ? 'scheduled/expired' : 'off') }}</span></td>
                <td class="actions">
                  <button class="btn btn-ghost btn-sm" (click)="toggle(p)">{{ p.active ? 'Disable' : 'Enable' }}</button>
                  <button class="btn btn-ghost btn-sm" (click)="remove(p)">Delete</button>
                </td>
              </tr>
            } @empty { <tr><td colspan="5" class="pad muted">No deals scheduled yet.</td></tr> }
          </tbody>
        </table>
      </div>

      <form class="card" [formGroup]="form" (ngSubmit)="create()">
        <h3>New deal</h3>
        <label class="label">Product</label>
        <input class="input" [(ngModel)]="prodQuery" [ngModelOptions]="{standalone: true}" (input)="searchProducts()" placeholder="Search product by title…" />
        @if (candidates().length) {
          <ul class="suggest">
            @for (p of candidates(); track p._id) {
              <li (click)="pickProduct(p)">{{ p.title }} <span class="muted small">{{ p.code }}</span></li>
            }
          </ul>
        }
        @if (picked(); as p) { <p class="picked">✓ {{ p.title }}</p> }

        <label class="label">Discount %</label>
        <input class="input" type="number" min="1" max="95" formControlName="discountPercent" />
        <div class="two">
          <div><label class="label">Starts</label><input class="input" type="datetime-local" formControlName="validFrom" /></div>
          <div><label class="label">Ends</label><input class="input" type="datetime-local" formControlName="validTo" /></div>
        </div>
        <button class="btn btn-primary" [disabled]="form.invalid || !picked()">Schedule deal</button>
      </form>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; }
      @media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .label { margin-top: 10px; } .pad { padding: 16px; } .small { font-size: 0.78rem; }
      .actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
      .btn-primary { margin-top: 16px; width: 100%; }
      .suggest { list-style: none; margin: 4px 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); max-height: 200px; overflow-y: auto; }
      .suggest li { padding: 8px 10px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; gap: 8px; }
      .suggest li:hover { background: var(--surface-2); }
      .picked { color: var(--brand-700, #15803d); font-weight: 600; font-size: 0.85rem; margin: 6px 0 0; }
    `,
  ],
})
export class DealsPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly productsApi = inject(ProductsApi);
  private readonly notify = inject(NotificationService);

  promotions = signal<Promotion[]>([]);
  candidates = signal<ProductRow[]>([]);
  picked = signal<ProductRow | null>(null);
  prodQuery = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  form = this.fb.nonNullable.group({
    discountPercent: [20, [Validators.required, Validators.min(1), Validators.max(95)]],
    validFrom: [toLocalInputValue(new Date()), Validators.required],
    validTo: [toLocalInputValue(new Date(Date.now() + 24 * 3600 * 1000)), Validators.required],
  });

  ngOnInit(): void { this.load(); }
  load(): void { this.api.get<Promotion[]>('/promotions').subscribe({ next: (p) => this.promotions.set(p) }); }

  isLive(p: Promotion): boolean {
    const now = Date.now();
    return p.active && new Date(p.validFrom).getTime() <= now && new Date(p.validTo).getTime() >= now;
  }

  searchProducts(): void {
    clearTimeout(this.searchTimer);
    if (this.prodQuery.trim().length < 2) { this.candidates.set([]); return; }
    this.searchTimer = setTimeout(() => {
      this.productsApi.list({ q: this.prodQuery.trim(), limit: 8 }).subscribe({ next: (r) => this.candidates.set(r.items) });
    }, 300);
  }

  pickProduct(p: ProductRow): void {
    this.picked.set(p);
    this.prodQuery = p.title;
    this.candidates.set([]);
  }

  create(): void {
    const chosen = this.picked();
    if (this.form.invalid || !chosen) return;
    const v = this.form.getRawValue();
    this.api.post('/promotions', {
      productId: chosen._id,
      discountPercent: Number(v.discountPercent),
      validFrom: new Date(v.validFrom).toISOString(),
      validTo: new Date(v.validTo).toISOString(),
    }).subscribe({
      next: () => {
        this.notify.push('Deal scheduled', chosen.title, 'success');
        this.picked.set(null); this.prodQuery = '';
        this.form.reset({ discountPercent: 20, validFrom: toLocalInputValue(new Date()), validTo: toLocalInputValue(new Date(Date.now() + 24 * 3600 * 1000)) });
        this.load();
      },
      error: (e) => this.notify.push('Failed', e?.error?.error?.message ?? e?.message, 'warning'),
    });
  }

  toggle(p: Promotion): void {
    this.api.patch(`/promotions/${p._id}`, { active: !p.active }).subscribe({ next: () => this.load() });
  }

  remove(p: Promotion): void {
    if (!confirm(`Delete the deal on "${p.product?.title ?? 'this product'}"?`)) return;
    this.api.delete(`/promotions/${p._id}`).subscribe({ next: () => this.load() });
  }
}
