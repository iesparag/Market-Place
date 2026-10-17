import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

interface ErrorLogRow {
  _id: string;
  method: string;
  path: string;
  statusCode: number;
  code: string;
  message: string;
  createdAt: string;
}
interface ErrorLogPage {
  items: ErrorLogRow[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}
interface ErrorLogDetail extends ErrorLogRow {
  stack?: string;
  query?: unknown;
  params?: unknown;
  body?: unknown;
  userId?: string;
  ip?: string;
}
interface SummaryResponse {
  byDay: { _id: string; count: number; serverErrors: number }[];
  topRoutes: { _id: { path: string; statusCode: number }; count: number }[];
}

/** Daily error/failure dashboard, backed by GET /errors (ErrorLog collection). */
@Component({
  selector: 'app-error-reports',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <header class="head">
      <div>
        <h1>Error Reports</h1>
        <p class="muted">Server failures (5xx) across the platform — where, how many, and what broke</p>
      </div>
    </header>

    @if (summary()) {
      <div class="stats">
        <div class="stat">
          <div class="stat-num">{{ todayCount() }}</div>
          <div class="stat-label muted">Errors today</div>
        </div>
        <div class="stat">
          <div class="stat-num">{{ totalLast14() }}</div>
          <div class="stat-label muted">Last 14 days</div>
        </div>
      </div>

      <div class="card">
        <h3>Last 14 days</h3>
        <div class="bars">
          @for (d of summary()!.byDay; track d._id) {
            <div class="bar-col" [title]="d._id + ': ' + d.count + ' errors'">
              <div class="bar" [style.height.px]="barHeight(d.count)"></div>
              <span class="bar-label muted">{{ d._id.slice(5) }}</span>
            </div>
          }
        </div>
      </div>

      <div class="card">
        <h3>Top failing routes (14d)</h3>
        <table class="table">
          <thead><tr><th>Route</th><th>Status</th><th>Count</th></tr></thead>
          <tbody>
            @for (r of summary()!.topRoutes; track r._id.path + r._id.statusCode) {
              <tr>
                <td class="code">{{ r._id.path }}</td>
                <td><span class="badge badge-danger">{{ r._id.statusCode }}</span></td>
                <td>{{ r.count }}</td>
              </tr>
            } @empty { <tr><td colspan="3" class="pad muted">No server errors in this window.</td></tr> }
          </tbody>
        </table>
      </div>
    }

    <div class="card card--flush">
      <div class="toolbar">
        <input class="input" placeholder="Filter by route…" [(ngModel)]="pathFilter" (ngModelChange)="onFilter()" />
        <input class="input status" type="number" placeholder="Status code" [(ngModel)]="statusFilter" (ngModelChange)="onFilter()" />
        <span class="count muted">{{ total() }} errors</span>
      </div>
      <table class="table">
        <thead><tr><th>When</th><th>Method</th><th>Route</th><th>Status</th><th>Message</th></tr></thead>
        <tbody>
          @for (r of rows(); track r._id) {
            <tr (click)="open(r._id)" class="row-click">
              <td class="muted">{{ r.createdAt | date: 'short' }}</td>
              <td>{{ r.method }}</td>
              <td class="code">{{ r.path }}</td>
              <td><span class="badge badge-danger">{{ r.statusCode }}</span></td>
              <td class="msg">{{ r.message }}</td>
            </tr>
          } @empty { <tr><td colspan="5" class="pad muted">{{ loading() ? 'Loading…' : 'No errors found.' }}</td></tr> }
        </tbody>
      </table>
      @if (pages() > 1) {
        <div class="pager">
          <button class="btn btn-ghost btn-sm" [disabled]="page() <= 1" (click)="go(page() - 1)">← Prev</button>
          <span class="muted">Page {{ page() }} of {{ pages() }}</span>
          <button class="btn btn-ghost btn-sm" [disabled]="page() >= pages()" (click)="go(page() + 1)">Next →</button>
        </div>
      }
    </div>

    @if (detail()) {
      <div class="overlay" (click)="detail.set(null)">
        <div class="panel" (click)="$event.stopPropagation()">
          <header>
            <h3>{{ detail()!.method }} {{ detail()!.path }} — {{ detail()!.statusCode }}</h3>
            <button class="btn btn-ghost btn-sm" (click)="detail.set(null)">✕</button>
          </header>
          <p class="muted">{{ detail()!.createdAt | date: 'medium' }} · code: {{ detail()!.code }}</p>
          <p>{{ detail()!.message }}</p>
          @if (detail()!.stack) {
            <h4>Stack</h4>
            <pre>{{ detail()!.stack }}</pre>
          }
          @if (detail()!.body) {
            <h4>Request body</h4>
            <pre>{{ detail()!.body | json }}</pre>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .head h1 { margin-bottom: 2px; }
      .stats { display: flex; gap: 16px; margin-bottom: 16px; }
      .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 20px; }
      .stat-num { font-size: 1.8rem; font-weight: 700; }
      .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
      .card h3 { margin: 0 0 12px; font-size: 0.95rem; }
      .bars { display: flex; align-items: flex-end; gap: 6px; height: 120px; }
      .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; flex: 1; height: 100%; }
      .bar { width: 100%; background: var(--danger); border-radius: 3px 3px 0 0; min-height: 2px; }
      .bar-label { font-size: 0.65rem; margin-top: 4px; white-space: nowrap; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
      .toolbar .input { flex: 1; min-width: 200px; } .status { max-width: 140px; flex: none; }
      .count { white-space: nowrap; }
      .pad { padding: 16px; }
      .code { font-family: ui-monospace, monospace; font-size: 0.82rem; }
      .msg { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .row-click { cursor: pointer; }
      .row-click:hover { background: var(--surface-hover, rgba(0, 0, 0, 0.03)); }
      .pager { display: flex; gap: 14px; align-items: center; justify-content: center; margin-top: 16px; }
      .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 50; }
      .panel { background: var(--surface); border-radius: 10px; padding: 20px; max-width: 700px; max-height: 80vh; overflow: auto; width: 90%; }
      .panel header { display: flex; justify-content: space-between; align-items: center; }
      .panel pre { background: var(--canvas, #f5f5f5); padding: 10px; border-radius: 6px; overflow: auto; font-size: 0.78rem; }
    `,
  ],
})
export class ErrorReportsPage implements OnInit {
  private readonly api = inject(ApiService);

  rows = signal<ErrorLogRow[]>([]);
  total = signal(0);
  page = signal(1);
  pages = signal(1);
  loading = signal(false);
  pathFilter = '';
  statusFilter: number | null = null;
  summary = signal<SummaryResponse | null>(null);
  detail = signal<ErrorLogDetail | null>(null);
  private readonly limit = 20;
  private debounce: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.api.get<SummaryResponse>('/errors/summary', { days: 14 }).subscribe({ next: (s) => this.summary.set(s) });
    this.load();
  }

  todayCount(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.summary()?.byDay.find((d) => d._id === today)?.count ?? 0;
  }
  totalLast14(): number {
    return this.summary()?.byDay.reduce((n, d) => n + d.count, 0) ?? 0;
  }
  barHeight(count: number): number {
    const max = Math.max(1, ...(this.summary()?.byDay.map((d) => d.count) ?? [1]));
    return Math.max(2, Math.round((count / max) * 100));
  }

  load(): void {
    this.loading.set(true);
    const params: Record<string, string | number> = { page: this.page(), limit: this.limit };
    if (this.pathFilter) params.path = this.pathFilter;
    if (this.statusFilter) params.statusCode = this.statusFilter;
    this.api.get<ErrorLogPage>('/errors', params).subscribe({
      next: (res) => {
        this.rows.set(res.items);
        this.total.set(res.total);
        this.pages.set(res.pages);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onFilter(): void {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 350);
  }
  go(p: number): void {
    this.page.set(p);
    this.load();
  }

  open(id: string): void {
    this.api.get<ErrorLogDetail>(`/errors/${id}`).subscribe({ next: (d) => this.detail.set(d) });
  }
}
