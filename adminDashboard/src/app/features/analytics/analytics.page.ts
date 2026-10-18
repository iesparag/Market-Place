import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';

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
interface TimeseriesPoint {
  date: string;
  orders: number;
  revenue: number;
}

/** Platform-wide trends — a step up from the dashboard's one-shot KPI cards: a
 * revenue/orders trend chart + the order-status breakdown, both from the same
 * /analytics endpoints the dashboard already uses (summary) plus a new one
 * (timeseries) added for this page. */
@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <header class="head">
      <div><h1>Analytics</h1><p class="muted">Revenue, orders, and platform growth</p></div>
      <select class="input days" [value]="days()" (change)="onDaysChange($any($event.target).value)">
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
      </select>
    </header>

    @if (summary(); as s) {
      <div class="kpis">
        <div class="card kpi"><div class="v">{{ s.orders }}</div><div class="muted">Total orders</div></div>
        <div class="card kpi"><div class="v">₹{{ s.revenue / 100 | number: '1.0-0' }}</div><div class="muted">Revenue (paid)</div></div>
        @if (s.wallet) {
          <div class="card kpi"><div class="v">₹{{ s.wallet.available / 100 | number: '1.0-0' }}</div><div class="muted">Wallet balance</div></div>
        } @else {
          <div class="card kpi"><div class="v accent">₹{{ s.commission / 100 | number: '1.0-0' }}</div><div class="muted">Platform commission</div></div>
          <div class="card kpi"><div class="v">{{ s.storeCount }}</div><div class="muted">Vendors</div></div>
          <div class="card kpi"><div class="v">{{ s.customerCount }}</div><div class="muted">Customers</div></div>
        }
        <div class="card kpi"><div class="v">{{ s.productCount }}</div><div class="muted">Products</div></div>
      </div>
    }

    <div class="card">
      <h3>Revenue — {{ days() }} days</h3>
      @if (series().length) {
        <div class="bars">
          @for (p of series(); track p.date) {
            <div class="bar-col" [title]="p.date + ': ₹' + (p.revenue / 100) + ' · ' + p.orders + ' orders'">
              <div class="bar" [style.height.px]="barHeight(p.revenue)"></div>
              <span class="bar-label muted">{{ p.date.slice(5) }}</span>
            </div>
          }
        </div>
      } @else {
        <p class="muted pad">No paid orders in this window yet.</p>
      }
    </div>

    @if (summary(); as s) {
      <div class="card">
        <h3>Orders by status</h3>
        <div class="statusrow">
          @for (entry of statusEntries(s.ordersByStatus); track entry[0]) {
            <div class="statuschip">
              <span class="badge">{{ entry[0] }}</span>
              <span class="n">{{ entry[1] }}</span>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .head h1 { margin-bottom: 2px; }
      .days { max-width: 160px; }
      .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; margin-bottom: 20px; }
      .kpi .v { font-size: 1.6rem; font-weight: 800; }
      .kpi .v.accent { color: var(--brand-700); }
      .card { margin-bottom: 20px; }
      .card h3 { margin: 0 0 14px; }
      .bars { display: flex; align-items: flex-end; gap: 4px; height: 160px; overflow-x: auto; }
      .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; flex: 1; min-width: 18px; height: 100%; }
      .bar { width: 100%; background: var(--brand-600); border-radius: 3px 3px 0 0; min-height: 2px; }
      .bar-label { font-size: 0.62rem; margin-top: 4px; white-space: nowrap; transform: rotate(-45deg); transform-origin: top left; }
      .pad { padding: 16px 0; }
      .statusrow { display: flex; gap: 12px; flex-wrap: wrap; }
      .statuschip { display: flex; align-items: center; gap: 8px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 14px; }
      .statuschip .n { font-weight: 800; }
    `,
  ],
})
export class AnalyticsPage implements OnInit {
  private readonly api = inject(ApiService);
  summary = signal<Summary | null>(null);
  series = signal<TimeseriesPoint[]>([]);
  days = signal(30);

  ngOnInit(): void {
    this.load();
  }

  onDaysChange(v: string): void {
    this.days.set(Number(v));
    this.loadSeries();
  }

  private load(): void {
    this.api.get<Summary>('/analytics/summary').subscribe({ next: (s) => this.summary.set(s) });
    this.loadSeries();
  }
  private loadSeries(): void {
    this.api.get<TimeseriesPoint[]>('/analytics/timeseries', { days: this.days() }).subscribe({
      next: (rows) => this.series.set(rows),
    });
  }

  barHeight(revenuePaise: number): number {
    const max = Math.max(1, ...this.series().map((p) => p.revenue));
    return Math.max(2, Math.round((revenuePaise / max) * 140));
  }

  statusEntries(byStatus: Record<string, number>): [string, number][] {
    return Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
  }
}
