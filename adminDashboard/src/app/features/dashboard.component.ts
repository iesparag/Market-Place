import { Component, inject, OnInit, signal } from '@angular/core';
import { AsyncPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../store/auth/auth.facade';
import { ApiService } from '../core/services/api.service';

interface Summary {
  orders: number;
  revenue: number;
  commission: number;
  productCount: number;
  storeCount: number;
  customerCount: number;
  ordersByStatus: Record<string, number>;
  wallet?: { available: number } | null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AsyncPipe, DecimalPipe, RouterLink],
  template: `
    <h1>Welcome{{ (auth.user$ | async)?.name ? ', ' + (auth.user$ | async)?.name : '' }} 👋</h1>
    <p class="muted">Overview of your marketplace.</p>

    @if (summary(); as s) {
      <div class="kpis">
        <div class="card kpi"><div class="v">{{ s.orders }}</div><div class="muted">Orders</div></div>
        <div class="card kpi"><div class="v">₹{{ s.revenue / 100 | number: '1.0-0' }}</div><div class="muted">Revenue (paid)</div></div>
        @if (s.wallet) {
          <div class="card kpi"><div class="v">₹{{ s.wallet.available / 100 | number: '1.0-0' }}</div><div class="muted">Wallet balance</div></div>
        } @else {
          <div class="card kpi"><div class="v accent">₹{{ s.commission / 100 | number: '1.0-0' }}</div><div class="muted">Platform commission</div></div>
        }
        <div class="card kpi"><div class="v">{{ s.productCount }}</div><div class="muted">Products</div></div>
        @if (!s.wallet) {
          <div class="card kpi"><div class="v">{{ s.storeCount }}</div><div class="muted">Vendors</div></div>
          <div class="card kpi"><div class="v">{{ s.customerCount }}</div><div class="muted">Customers</div></div>
        }
      </div>
    }

    <h3 class="sec">Quick access</h3>
    <div class="tiles">
      @for (section of auth.nav$ | async; track section.section) {
        @for (item of section.items; track item.route) {
          <a class="card tile" [routerLink]="item.route">
            <div class="t-section muted">{{ section.section }}</div>
            <div class="t-label">{{ item.label }}</div>
          </a>
        }
      }
    </div>
  `,
  styles: [
    `
      .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; margin: 20px 0; }
      .kpi .v { font-size: 1.6rem; font-weight: 800; }
      .kpi .v.accent { color: var(--brand-700); }
      .sec { margin-top: 24px; }
      .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-top: 12px; }
      .tile { text-decoration: none; transition: transform 0.15s, box-shadow 0.15s; }
      .tile:hover { transform: translateY(-3px); box-shadow: var(--shadow); }
      .t-section { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
      .t-label { font-weight: 700; font-size: 1.05rem; margin-top: 4px; }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthFacade);
  private readonly api = inject(ApiService);
  summary = signal<Summary | null>(null);

  ngOnInit(): void {
    this.api.get<Summary>('/analytics/summary').subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.summary.set(null),
    });
  }
}
