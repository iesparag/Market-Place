import { Component, effect, inject, Input, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { PaymentService, type PaymentMethodOption, type PaymentStatus } from '../../core/services/payment.service';

interface OrderItem { title: string; variantLabel?: string; qty: number; lineTotal: number; modifiers?: { name: string }[]; }
interface Amounts { itemsTotal?: number; discount?: number; tax?: number; delivery?: number; grandTotal: number; }
interface OrderPayment { method?: string; status?: string; paidAt?: string; refundedAmount?: number; }
interface Order { _id: string; orderNumber: string; status: string; couponCode?: string; amounts: Amounts; items: OrderItem[]; payment?: OrderPayment; }

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

        @if (banner(); as b) { <div class="pbanner" [class.warn]="b.tone === 'warn'">{{ b.text }}</div> }

        @if (isCod()) {
          <div class="codnote">💵 Pay <b>₹{{ o.amounts.grandTotal / 100 }}</b> in cash when your order arrives.</div>
        }

        @if (needsPayment()) {
          <div class="pending-actions">
            @for (m of methods(); track m.id) {
              @if (m.enabled) {
                <button class="btn pay" [class.btn-primary]="m.id === 'razorpay'" [class.btn-ghost]="m.id !== 'razorpay'"
                        [disabled]="paying()" (click)="payWith(o, m.id)">
                  {{ paying() ? 'Processing…' : (m.id === 'cod' ? 'Pay on delivery' : 'Pay ₹' + o.amounts.grandTotal / 100) }}
                </button>
              }
            }
            <button class="btn btn-ghost" [disabled]="paying()" (click)="cancel(o)">Cancel order</button>
          </div>
          @if (settling()) { <p class="muted small">Confirming your payment with the bank…</p> }
        }

        @if (o.payment?.refundedAmount) {
          <div class="pbanner">↩️ ₹{{ (o.payment?.refundedAmount ?? 0) / 100 }} has been refunded — it reaches your account in 3–5 working days.</div>
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
      .pending-actions { display: flex; gap: 10px; justify-content: center; margin-top: 10px; flex-wrap: wrap; }
      .pbanner { margin: 14px 0 4px; padding: 10px 14px; border-radius: 8px; background: var(--surface-2); font-size: 0.9rem; }
      .pbanner.warn { background: var(--danger-bg); color: var(--danger); }
      .codnote { margin: 14px 0 4px; padding: 10px 14px; border-radius: 8px; background: var(--surface-2); font-size: 0.9rem; }
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
  private readonly payments = inject(PaymentService);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  order = signal<Order | null>(null);
  paying = signal(false);
  settling = signal(false);
  methods = signal<PaymentMethodOption[]>([]);
  banner = signal<{ text: string; tone: 'info' | 'warn' } | null>(null);
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
    void this.payments.loadMethods().then((r) => this.methods.set(r.methods));

    // Checkout hands us the outcome so the customer immediately knows where they stand.
    const q = this.route.snapshot.queryParamMap;
    const outcome = q.get('payment');
    if (outcome === 'failed')
      this.banner.set({ text: q.get('reason') ?? 'Your payment did not go through. You can try again below.', tone: 'warn' });
    else if (outcome === 'cancelled')
      this.banner.set({ text: 'Payment cancelled — your order is saved. Pay whenever you are ready.', tone: 'warn' });
    else if (outcome === 'cod')
      this.banner.set({ text: 'Order confirmed. Please keep the cash ready for delivery.', tone: 'info' });
    else if (outcome === 'paid') this.banner.set({ text: 'Payment successful — thank you! 🎉', tone: 'info' });
  }

  /** Unpaid and still payable → show the pay buttons. */
  needsPayment(): boolean {
    const o = this.order();
    if (!o) return false;
    const paid = o.payment?.status === 'paid';
    return o.status === 'pending' && !paid && o.payment?.method !== 'cod';
  }
  isCod(): boolean {
    return this.order()?.payment?.method === 'cod' && this.order()?.payment?.status !== 'paid';
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

  /** Retry (or first-time) payment from the order page. */
  async payWith(o: Order, method: 'razorpay' | 'cod'): Promise<void> {
    this.paying.set(true);
    this.banner.set(null);
    const result = await this.payments.pay(o._id, method);
    this.paying.set(false);

    if (result.outcome === 'cancelled') {
      this.banner.set({ text: 'Payment cancelled — your order is still saved.', tone: 'warn' });
      return;
    }
    if (result.outcome === 'failed') {
      this.banner.set({ text: result.message, tone: 'warn' });
      // A UPI collect request can still land after the sheet closes; the webhook
      // settles it, so keep watching for a short while before giving up.
      void this.watchForLateSettlement(o._id);
      return;
    }
    this.applyStatus(result.status);
    this.banner.set({
      text: result.outcome === 'cod' ? 'Order confirmed — pay in cash on delivery.' : 'Payment successful — thank you! 🎉',
      tone: 'info',
    });
  }

  private async watchForLateSettlement(orderId: string): Promise<void> {
    this.settling.set(true);
    const status = await this.payments.waitForSettlement(orderId, 45_000);
    this.settling.set(false);
    if (status?.paymentStatus === 'paid') {
      this.applyStatus(status);
      this.banner.set({ text: 'Payment confirmed — thank you! 🎉', tone: 'info' });
    }
  }

  private applyStatus(status: PaymentStatus): void {
    const o = this.order();
    if (!o) return;
    this.order.set({
      ...o,
      status: status.orderStatus,
      payment: { ...o.payment, status: status.paymentStatus, method: status.method ?? undefined },
    });
    this.maybePoll();
  }

  cancel(o: Order): void {
    if (!confirm('Cancel this order?')) return;
    this.api.post<Order>(`/orders/${o._id}/cancel`, {}).subscribe({
      next: (updated) => this.order.set(updated),
    });
  }
}
