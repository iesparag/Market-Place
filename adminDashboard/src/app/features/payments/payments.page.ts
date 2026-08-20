import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { downloadCsv } from '../../shared/csv';

interface PaymentRefund {
  at: string;
  refundId: string;
  amount: number;
  status: string;
  reason?: string;
}
interface PaymentAttempt {
  at: string;
  providerPaymentId?: string;
  status: string;
  method?: string;
  errorDescription?: string;
}
interface Payment {
  _id: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  method: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  amount: number;
  amountPaid: number;
  refundedAmount: number;
  currency: string;
  status: string;
  paidAt?: string;
  failureReason?: string;
  createdAt: string;
  attempts: PaymentAttempt[];
  refunds: PaymentRefund[];
}
interface Reconciliation {
  range: { from: string; to: string };
  provider: string;
  byStatus: { _id: string; count: number; amount: number; refunded: number }[];
  unsettledPayments: { paymentId: string; orderNumber: string; amount: number; providerPaymentId?: string }[];
  failedWebhooks: { eventId: string; type: string; error: string; at: string }[];
}

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [DecimalPipe, SlicePipe, FormsModule, HasPermissionDirective],
  template: `
    <header class="head">
      <div>
        <h1>Payments</h1>
        <p class="muted">
          Gateway: <b>{{ recon()?.provider || '—' }}</b> · every rupee collected, refunded and reconciled
        </p>
      </div>
      <div class="hactions">
        <button class="btn btn-sm" (click)="exportCsv()">⬇ CSV</button>
        <button class="btn btn-ghost btn-sm" (click)="load()">↻ Refresh</button>
      </div>
    </header>

    <!-- Reconciliation: does the money add up? -->
    @if (recon(); as r) {
      <div class="kpis">
        @for (s of r.byStatus; track s._id) {
          <div class="card kpi">
            <div class="v">₹{{ s.amount / 100 | number: '1.0-0' }}</div>
            <div class="muted">{{ label(s._id) }} · {{ s.count }}</div>
          </div>
        }
      </div>

      @if (r.unsettledPayments.length) {
        <div class="card alert">
          <b>⚠ {{ r.unsettledPayments.length }} payment(s) captured at the gateway but not settled on the order.</b>
          <p class="muted">Money was taken and the order was not marked paid. Replay or investigate each one.</p>
          <ul>
            @for (u of r.unsettledPayments; track u.paymentId) {
              <li>{{ u.orderNumber }} — ₹{{ u.amount / 100 }} ({{ u.providerPaymentId }})</li>
            }
          </ul>
        </div>
      }
      @if (r.failedWebhooks.length) {
        <div class="card alert">
          <b>⚠ {{ r.failedWebhooks.length }} webhook(s) failed to process.</b>
          <p class="muted">These are retried by the gateway; replay one manually once the cause is fixed.</p>
          <ul>
            @for (w of r.failedWebhooks; track w.eventId) {
              <li>{{ w.type }} · {{ w.eventId }} — <span class="muted">{{ w.error }}</span></li>
            }
          </ul>
        </div>
      }
    }

    <!-- Filters -->
    <div class="card filters">
      <input class="input" [(ngModel)]="query" (keyup.enter)="load()" placeholder="Order number or gateway payment id" />
      <select class="input" [(ngModel)]="status" (change)="load()">
        <option value="">All statuses</option>
        <option value="paid">Paid</option>
        <option value="created">Awaiting payment</option>
        <option value="attempted">Failed attempt</option>
        <option value="partially_refunded">Partially refunded</option>
        <option value="refunded">Refunded</option>
      </select>
      <select class="input" [(ngModel)]="method" (change)="load()">
        <option value="">All methods</option>
        <option value="razorpay">Online</option>
        <option value="cod">Cash on delivery</option>
        <option value="mock">Test</option>
      </select>
      <button class="btn btn-sm" (click)="load()">Search</button>
    </div>

    <div class="card card--flush">
      <table class="table">
        <thead>
          <tr><th>Order</th><th>Method</th><th>Amount</th><th>Refunded</th><th>Status</th><th>Gateway ref</th><th>Date</th><th></th></tr>
        </thead>
        <tbody>
          @for (p of payments(); track p._id) {
            <tr [class.dim]="p.status === 'created'">
              <td><b>{{ p.orderNumber }}</b></td>
              <td>{{ methodLabel(p) }}</td>
              <td class="price">₹{{ (p.amountPaid || p.amount) / 100 | number: '1.0-0' }}</td>
              <td>{{ p.refundedAmount ? '−₹' + p.refundedAmount / 100 : '—' }}</td>
              <td>
                <span class="badge" [class.badge-success]="p.status === 'paid'"
                      [class.badge-warning]="p.status === 'created' || p.status === 'attempted'"
                      [class.badge-danger]="p.status === 'refunded' || p.status === 'failed'">{{ label(p.status) }}</span>
                @if (p.failureReason && p.status !== 'paid') { <div class="muted tiny">{{ p.failureReason }}</div> }
              </td>
              <td class="muted tiny">{{ p.providerPaymentId || p.providerOrderId || '—' }}</td>
              <td class="muted">{{ p.createdAt | slice: 0:10 }}</td>
              <td class="actions">
                @if (refundable(p) > 0) {
                  <button class="btn btn-ghost btn-sm refund" (click)="startRefund(p)" *hasPermission="'order:refund'">Refund</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="pad muted">No payments match this filter.</td></tr>
          }
        </tbody>
      </table>
    </div>

    <!-- Refund dialog: partial by default, so a mistake costs one item not the order -->
    @if (refunding(); as p) {
      <div class="backdrop" (click)="refunding.set(null)"></div>
      <div class="modal card">
        <h3>Refund {{ p.orderNumber }}</h3>
        <p class="muted">
          Collected ₹{{ (p.amountPaid || p.amount) / 100 }}@if (p.refundedAmount) { , already refunded ₹{{ p.refundedAmount / 100 }} }.
          Refundable now: <b>₹{{ refundable(p) / 100 }}</b>.
        </p>
        <label class="label">Amount (₹)</label>
        <input class="input" type="number" [(ngModel)]="refundAmount" [max]="refundable(p) / 100" />
        <label class="label">Reason</label>
        <input class="input" [(ngModel)]="refundReason" placeholder="Damaged item, cancelled by vendor…" />
        @if (refundError()) { <div class="err">{{ refundError() }}</div> }
        <div class="mactions">
          <button class="btn btn-ghost" (click)="refunding.set(null)">Cancel</button>
          <button class="btn btn-primary" [disabled]="busy()" (click)="confirmRefund(p)">
            {{ busy() ? 'Refunding…' : 'Refund ₹' + refundAmount }}
          </button>
        </div>
        @if (p.method === 'cod') {
          <p class="muted tiny">Cash on delivery: this only reverses the accounting — no money leaves the gateway.</p>
        } @else {
          <p class="muted tiny">The customer receives it in 3–5 working days.</p>
        }
      </div>
    }
  `,
  styles: [
    `
      .head { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
      .hactions { display: flex; gap: 8px; }
      .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-bottom: 20px; }
      .kpi .v { font-size: 1.5rem; font-weight: 800; }
      .alert { border-left: 3px solid var(--danger); margin-bottom: 16px; }
      .alert ul { margin: 8px 0 0 18px; font-size: 0.88rem; }
      .filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
      .filters .input { max-width: 260px; }
      .pad { padding: 16px; } .actions { text-align: right; }
      .tiny { font-size: 0.75rem; }
      tr.dim { opacity: 0.65; }
      .refund { color: var(--danger); }
      .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 40; }
      .modal { position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(440px, 92vw); }
      .modal .label { margin-top: 10px; }
      .mactions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
      .err { color: var(--danger); font-size: 0.85rem; margin-top: 10px; }
    `,
  ],
})
export class PaymentsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  payments = signal<Payment[]>([]);
  recon = signal<Reconciliation | null>(null);
  refunding = signal<Payment | null>(null);
  refundError = signal<string | null>(null);
  busy = signal(false);

  query = '';
  status = '';
  method = '';
  refundAmount = 0;
  refundReason = '';

  readonly collected = computed(() =>
    this.payments().filter((p) => p.status === 'paid').reduce((n, p) => n + (p.amountPaid || p.amount), 0),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const params: Record<string, string | number> = { limit: 100 };
    if (this.query.trim()) params['q'] = this.query.trim();
    if (this.status) params['status'] = this.status;
    if (this.method) params['method'] = this.method;
    this.api.get<Payment[]>('/payments', params).subscribe({
      next: (rows) => this.payments.set(rows),
      error: (e) => this.notify.push('Could not load payments', e?.message, 'warning'),
    });
    this.api.get<Reconciliation>('/payments/reconcile').subscribe({ next: (r) => this.recon.set(r) });
  }

  /** What can still be sent back on this payment. */
  refundable(p: Payment): number {
    if (p.status !== 'paid' && p.status !== 'partially_refunded') return 0;
    return (p.amountPaid || p.amount) - (p.refundedAmount ?? 0);
  }

  methodLabel(p: Payment): string {
    if (p.method === 'cod') return '💵 Cash on delivery';
    if (p.method === 'mock') return '🧪 Test gateway';
    const last = p.attempts?.at(-1)?.method;
    return last ? `📱 ${last.toUpperCase()}` : '📱 Online';
  }

  label(status: string): string {
    return (
      {
        paid: 'Paid',
        created: 'Awaiting payment',
        attempted: 'Failed attempt',
        failed: 'Failed',
        refunded: 'Refunded',
        partially_refunded: 'Partly refunded',
      }[status] ?? status
    );
  }

  startRefund(p: Payment): void {
    this.refundError.set(null);
    this.refundReason = '';
    this.refundAmount = this.refundable(p) / 100;
    this.refunding.set(p);
  }

  confirmRefund(p: Payment): void {
    const paise = Math.round(this.refundAmount * 100);
    if (paise <= 0 || paise > this.refundable(p)) {
      this.refundError.set(`Enter an amount between ₹1 and ₹${this.refundable(p) / 100}`);
      return;
    }
    this.busy.set(true);
    this.api.post(`/payments/order/${p.orderId}/refund`, { amount: paise, reason: this.refundReason || undefined }).subscribe({
      next: () => {
        this.busy.set(false);
        this.refunding.set(null);
        this.notify.push('Refund sent', `₹${paise / 100} for ${p.orderNumber}`, 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.refundError.set(e?.message ?? 'Refund failed');
      },
    });
  }

  exportCsv(): void {
    downloadCsv<Payment>('payments.csv', this.payments(), [
      { label: 'Order', value: (p) => p.orderNumber },
      { label: 'Method', value: (p) => p.method },
      { label: 'Status', value: (p) => p.status },
      { label: 'Amount (₹)', value: (p) => (p.amountPaid || p.amount) / 100 },
      { label: 'Refunded (₹)', value: (p) => (p.refundedAmount ?? 0) / 100 },
      { label: 'Gateway payment id', value: (p) => p.providerPaymentId ?? '' },
      { label: 'Date', value: (p) => p.createdAt?.slice(0, 10) ?? '' },
    ]);
  }
}
