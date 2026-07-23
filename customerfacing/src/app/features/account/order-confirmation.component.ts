import { Component, effect, inject, Input, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';

interface OrderItem { title: string; variantLabel?: string; qty: number; lineTotal: number; modifiers?: { name: string }[]; }
interface Amounts { itemsTotal?: number; discount?: number; tax?: number; delivery?: number; grandTotal: number; }
interface Order { _id: string; orderNumber: string; status: string; couponCode?: string; amounts: Amounts; items: OrderItem[]; }

const STEPS = ['pending', 'paid', 'fulfilled'];
const TERMINAL = ['fulfilled', 'cancelled', 'refunded'];

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (order(); as o) {
      <div class="card done">
        <div class="check">{{ o.status === 'cancelled' ? '❌' : '✅' }}</div>
        <h1>Order {{ o.status === 'pending' ? 'placed' : o.status }}!</h1>
        <p class="muted">Order <b>{{ o.orderNumber }}</b></p>

        <div class="track">
          @for (s of steps; track s; let i = $index) {
            <div class="step" [class.on]="stepIndex(o.status) >= i">
              <div class="dot">{{ stepIndex(o.status) >= i ? '✓' : i + 1 }}</div>
              <span>{{ s }}</span>
            </div>
          }
        </div>

        @if (o.status === 'pending') {
          <div class="pending-actions">
            <button class="btn btn-primary pay" [disabled]="paying()" (click)="pay(o)">
              {{ paying() ? 'Processing…' : 'Pay ₹' + o.amounts.grandTotal / 100 }}
            </button>
            <button class="btn btn-ghost" (click)="cancel(o)">Cancel order</button>
          </div>
          <p class="muted small">(mock payment — wires to Stripe Connect later)</p>
        }
      </div>

      <div class="card">
        <h3>Items</h3>
        @for (it of o.items; track it.title + it.variantLabel) {
          <div class="row">
            <span>{{ it.title }} <span class="muted">× {{ it.qty }}</span>
              @if (it.modifiers?.length) { <span class="muted">· {{ names(it) }}</span> }
            </span>
            <span>₹{{ it.lineTotal / 100 }}</span>
          </div>
        }
        <div class="row sub"><span>Items total</span><span>₹{{ (o.amounts.itemsTotal ?? 0) / 100 }}</span></div>
        @if (o.amounts.discount) { <div class="row disc"><span>Discount {{ o.couponCode ? '(' + o.couponCode + ')' : '' }}</span><span>−₹{{ o.amounts.discount / 100 }}</span></div> }
        <div class="row sub"><span>Tax</span><span>₹{{ (o.amounts.tax ?? 0) / 100 }}</span></div>
        <div class="row sub"><span>Delivery</span><span>{{ (o.amounts.delivery ?? 0) === 0 ? 'FREE' : '₹' + (o.amounts.delivery ?? 0) / 100 }}</span></div>
        <div class="row total"><span>Total</span><span class="price">₹{{ o.amounts.grandTotal / 100 }}</span></div>
        <a class="btn btn-ghost" routerLink="/account/orders">View all orders</a>
      </div>
    } @else { <div class="card muted">Loading order…</div> }
  `,
  styles: [
    `
      .done { text-align: center; } .check { font-size: 2.5rem; }
      .track { display: flex; justify-content: center; gap: 8px; margin: 20px 0; }
      .step { display: grid; justify-items: center; gap: 6px; color: var(--text-muted); font-size: 0.8rem; }
      .step .dot { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center;
                   background: var(--surface-2); border: 1px solid var(--border); font-weight: 700; }
      .step.on { color: var(--brand-700); }
      .step.on .dot { background: var(--brand-gradient); color: #fff; border-color: transparent; }
      .pending-actions { display: flex; gap: 10px; justify-content: center; margin-top: 10px; }
      .pay { margin-top: 0; } .small { font-size: 0.75rem; margin-top: 6px; }
      .row { display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--border); }
      .row.sub { color: var(--text-muted); font-size: 0.9rem; border-top: none; padding: 3px 0; }
      .row.disc { color: var(--success); font-size: 0.9rem; border-top: none; padding: 3px 0; }
      .total { font-weight: 700; } .btn-ghost { margin-top: 14px; }
    `,
  ],
})
export class OrderConfirmationComponent implements OnInit, OnDestroy {
  @Input() id = '';
  private readonly api = inject(ApiService);
  private readonly socket = inject(SocketService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  order = signal<Order | null>(null);
  paying = signal(false);
  steps = STEPS;

  constructor() {
    // Live status: when a socket push arrives for THIS order, update it instantly.
    effect(() => {
      const upd = this.socket.lastStatus();
      const o = this.order();
      if (upd && o && upd.orderId === o._id) {
        this.order.set({ ...o, status: upd.status });
        if (TERMINAL.includes(upd.status)) this.stopPoll();
      }
    });
  }

  ngOnInit(): void {
    this.api.get<Order>(`/orders/${this.id}`).subscribe({ next: (o) => { this.order.set(o); this.maybePoll(); } });
    this.socket.connect();
  }

  ngOnDestroy(): void { this.stopPoll(); }

  /** Fallback to socket: while the order isn't terminal, poll so status updates without a refresh. */
  private maybePoll(): void {
    if (!this.browser || this.pollTimer) return;
    const s = this.order()?.status;
    if (!s || TERMINAL.includes(s)) return;
    this.pollTimer = setInterval(() => {
      this.api.get<Order>(`/orders/${this.id}`).subscribe({
        next: (o) => { this.order.set(o); if (TERMINAL.includes(o.status)) this.stopPoll(); },
      });
    }, 6000);
  }
  private stopPoll(): void { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } }

  stepIndex(status: string): number {
    return STEPS.indexOf(status);
  }
  names(it: OrderItem): string {
    return (it.modifiers ?? []).map((m) => m.name).join(', ');
  }

  pay(o: Order): void {
    this.paying.set(true);
    this.api.post<Order>(`/orders/${o._id}/pay`, {}).subscribe({
      next: (updated) => { this.order.set(updated); this.paying.set(false); this.maybePoll(); },
      error: () => this.paying.set(false),
    });
  }

  cancel(o: Order): void {
    if (!confirm('Cancel this order?')) return;
    this.api.post<Order>(`/orders/${o._id}/cancel`, {}).subscribe({
      next: (updated) => this.order.set(updated),
    });
  }
}
