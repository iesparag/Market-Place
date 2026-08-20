import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CartFacade } from '../../store/cart/cart.facade';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { LocationPickerComponent, type PickedLocation } from '../../shared/location-picker.component';
import { PaymentService, type PaymentMethodOption } from '../../core/services/payment.service';
import { selectCartLines } from '../../store/cart/cart.selectors';
import { Store } from '@ngrx/store';

interface Settings { taxPercent: number; deliveryFee: number; freeDeliveryAbove: number; }
interface Address { _id: string; label: string; line1: string; city: string; pincode?: string; phone?: string; isDefault?: boolean; }

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, RouterLink, LocationPickerComponent],
  template: `
    @if (!auth.isLoggedIn()) {
      <div class="card">
        <h1>Sign in to checkout</h1>
        <p class="muted">You need an account to place an order.</p>
        <a class="btn btn-primary" routerLink="/login">Sign in</a>
      </div>
    } @else {
      <div class="wrap">
        <form class="card" [formGroup]="form" (ngSubmit)="place()">
          <h1>Checkout</h1>
          @if (error()) { <div class="err">{{ error() }}</div> }

          @if (addresses().length) {
            <label class="label">Deliver to</label>
            <div class="addrpick">
              @for (a of addresses(); track a._id) {
                <button type="button" class="addrcard" [class.sel]="selectedId() === a._id" (click)="selectAddr(a)">
                  <b>{{ a.label }}</b> @if (a.isDefault) { <span class="badge badge-info">default</span> }
                  <div class="muted small">{{ a.line1 }}, {{ a.city }} {{ a.pincode }}</div>
                </button>
              }
              <button type="button" class="addrcard new" [class.sel]="selectedId() === ''" (click)="useNew()">+ New address</button>
            </div>
          }

          <label class="label">Full name</label><input class="input" formControlName="name" />
          @if (form.controls.name.touched && form.controls.name.invalid) { <div class="fe">Name is required</div> }
          <label class="label">Phone</label><input class="input" formControlName="phone" />
          @if (form.controls.phone.touched && form.controls.phone.invalid) { <div class="fe">Phone is required</div> }
          <label class="label">Address</label>
          <app-location-picker (picked)="onPicked($event)" />
          <input class="input" formControlName="line1" placeholder="Street / house" />
          @if (form.controls.line1.touched && form.controls.line1.invalid) { <div class="fe">Address is required</div> }
          <div class="two">
            <div><label class="label">City</label><input class="input" formControlName="city" />
              @if (form.controls.city.touched && form.controls.city.invalid) { <div class="fe">City is required</div> }</div>
            <div><label class="label">Pincode</label><input class="input" formControlName="pincode" /></div>
          </div>
          @if (payMethods().length) {
            <label class="label paylabel">Payment method</label>
            <div class="methods">
              @for (m of payMethods(); track m.id) {
                <button type="button" class="method" [class.sel]="selectedMethod() === m.id"
                        [disabled]="!isAvailable(m)" (click)="selectedMethod.set(m.id)">
                  <span class="micon">{{ m.id === 'cod' ? '💵' : '📱' }}</span>
                  <span class="mbody">
                    <b>{{ m.label }}</b>
                    <span class="muted small">{{ unavailableReason(m) || m.description }}</span>
                  </span>
                  <span class="mdot">{{ selectedMethod() === m.id ? '●' : '○' }}</span>
                </button>
              }
            </div>
          }

          <button class="btn btn-primary" [disabled]="placing() || itemsTotal() === 0">
            {{ payButtonLabel() }}
          </button>
          @if (selectedMethod() === 'cod') {
            <p class="muted small">You'll pay the delivery agent in cash when your order arrives.</p>
          } @else {
            <p class="muted small">Secure payment via UPI, card, netbanking or wallet. You'll be redirected back here.</p>
          }
        </form>

        <aside class="card summary">
          <h3>Order summary</h3>
          <div class="coupon">
            <input class="input" [(ngModel)]="couponCode" [ngModelOptions]="{standalone:true}" placeholder="Coupon code" />
            <button type="button" class="btn btn-sm" (click)="applyCoupon()">Apply</button>
          </div>
          @if (couponMsg()) { <div class="cmsg" [class.ok]="discount() > 0">{{ couponMsg() }}</div> }

          <div class="row"><span>Items</span><span>₹{{ itemsTotal() / 100 }}</span></div>
          @if (discount() > 0) { <div class="row disc"><span>Discount ({{ appliedCode() }})</span><span>−₹{{ discount() / 100 }}</span></div> }
          <div class="row"><span>Tax</span><span>₹{{ tax() / 100 }}</span></div>
          <div class="row"><span>Delivery</span><span>{{ delivery() === 0 ? 'FREE' : '₹' + delivery() / 100 }}</span></div>
          <div class="row total"><span>Total</span><span class="price">₹{{ grandTotal() / 100 }}</span></div>
        </aside>
      </div>
    }
  `,
  styles: [
    `
      .wrap { display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px; align-items: start; }
      @media (max-width: 720px) { .wrap { grid-template-columns: 1fr; } }
      form { display: grid; gap: 6px; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .label { margin-top: 10px; } .btn-primary { margin-top: 18px; }
      .addrpick { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
      @media (max-width: 520px) { .addrpick { grid-template-columns: 1fr; } }
      .addrcard { text-align: left; padding: 12px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; }
      .addrcard:hover { border-color: var(--brand-400, #fb923c); }
      .addrcard.sel { border-color: var(--brand-600); background: var(--brand-50, #fff5ef); }
      .addrcard.new { display: grid; place-items: center; color: var(--brand-700); font-weight: 700; }
      .small { font-size: 0.8rem; margin-top: 2px; }
      .paylabel { margin-top: 18px; }
      .methods { display: grid; gap: 10px; margin-top: 6px; }
      .method { display: flex; align-items: center; gap: 12px; text-align: left; padding: 14px;
                border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; }
      .method:hover:not(:disabled) { border-color: var(--brand-400, #fb923c); }
      .method.sel { border-color: var(--brand-600); background: var(--brand-50, #fff5ef); }
      .method:disabled { opacity: 0.5; cursor: not-allowed; }
      .micon { font-size: 1.3rem; }
      .mbody { display: grid; flex: 1; }
      .mdot { color: var(--brand-600); font-size: 1.1rem; }
      .coupon { display: flex; gap: 8px; margin-bottom: 8px; }
      .cmsg { font-size: 0.85rem; color: var(--danger); margin-bottom: 8px; } .cmsg.ok { color: var(--success); }
      .row { display: flex; justify-content: space-between; padding: 5px 0; }
      .disc { color: var(--success); }
      .total { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 10px; font-weight: 700; }
      .err { background: var(--danger-bg); color: var(--danger); padding: 10px; border-radius: 8px; }
      .fe { color: var(--danger); font-size: 0.8rem; }
    `,
  ],
})
export class CheckoutComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  readonly cart = inject(CartFacade);
  readonly auth = inject(AuthService);
  private readonly payments = inject(PaymentService);

  placing = signal(false);
  error = signal<string | null>(null);
  payMethods = signal<PaymentMethodOption[]>([]);
  selectedMethod = signal<'razorpay' | 'cod'>('razorpay');
  /** What the pay button says while the gateway sheet is open. */
  payStage = signal<'idle' | 'placing' | 'paying'>('idle');
  itemsTotal = signal(0);
  addresses = signal<Address[]>([]);
  selectedId = signal<string>('');
  settings = signal<Settings>({ taxPercent: 5, deliveryFee: 4000, freeDeliveryAbove: 50000 });
  couponCode = '';
  appliedCode = signal('');
  discount = signal(0);
  couponMsg = signal<string | null>(null);

  tax = computed(() => Math.round(((this.itemsTotal() - this.discount()) * this.settings().taxPercent) / 100));
  delivery = computed(() => (this.itemsTotal() >= this.settings().freeDeliveryAbove ? 0 : this.settings().deliveryFee));
  grandTotal = computed(() => this.itemsTotal() - this.discount() + this.tax() + this.delivery());

  form = this.fb.nonNullable.group({
    name: ['', Validators.required], phone: ['', Validators.required],
    line1: ['', Validators.required], city: ['', Validators.required], pincode: [''],
  });

  ngOnInit(): void {
    this.cart.total$.subscribe((t) => this.itemsTotal.set(t));
    this.api.get<Settings>('/settings').subscribe({ next: (s) => this.settings.set(s) });
    void this.payments.loadMethods().then((r) => {
      const usable = r.methods.filter((m) => m.enabled);
      this.payMethods.set(usable);
      const first = usable.find((m) => this.isAvailable(m));
      if (first) this.selectedMethod.set(first.id);
    });
    // Prefill name from profile; auto-select the default saved address (editable).
    this.form.controls.name.setValue(this.auth.user()?.name ?? '');
    this.api.get<Address[]>('/addresses').subscribe({
      next: (list) => {
        this.addresses.set(list);
        const def = list.find((a) => a.isDefault) ?? list[0];
        if (def) this.selectAddr(def);
      },
    });
  }

  selectAddr(a: Address): void {
    this.selectedId.set(a._id);
    this.form.patchValue({
      line1: a.line1, city: a.city, pincode: a.pincode ?? '',
      phone: a.phone || this.form.controls.phone.value,
    });
  }
  useNew(): void {
    this.selectedId.set('');
    this.form.patchValue({ line1: '', city: '', pincode: '' });
  }
  onPicked(loc: PickedLocation): void {
    this.selectedId.set('');
    this.form.patchValue({ line1: loc.line1, city: loc.city, pincode: loc.pincode });
  }

  applyCoupon(): void {
    if (!this.couponCode.trim()) return;
    this.api.post<{ code: string; discount: number }>('/coupons/validate', { code: this.couponCode.trim(), itemsTotal: this.itemsTotal() }).subscribe({
      next: (r) => { this.discount.set(r.discount); this.appliedCode.set(r.code); this.couponMsg.set(`Coupon ${r.code} applied — you save ₹${r.discount / 100}`); },
      error: (e) => { this.discount.set(0); this.appliedCode.set(''); this.couponMsg.set(e?.message ?? 'Invalid coupon'); },
    });
  }

  /** COD is capped by the admin; the option stays visible but explains why it's off. */
  isAvailable(m: PaymentMethodOption): boolean {
    if (!m.enabled) return false;
    if (m.id === 'cod' && m.maxOrderValue && this.grandTotal() > m.maxOrderValue) return false;
    return true;
  }
  unavailableReason(m: PaymentMethodOption): string | null {
    if (m.id === 'cod' && m.maxOrderValue && this.grandTotal() > m.maxOrderValue)
      return `Not available above ₹${m.maxOrderValue / 100}`;
    return null;
  }

  payButtonLabel(): string {
    if (this.payStage() === 'placing') return 'Placing your order…';
    if (this.payStage() === 'paying') return 'Waiting for payment…';
    const total = `₹${this.grandTotal() / 100}`;
    return this.selectedMethod() === 'cod' ? `Place order · ${total}` : `Pay ${total}`;
  }

  /**
   * Place the order, then take payment for it.
   *
   * The order is created first and deliberately survives a failed or abandoned
   * payment — the customer lands on the order page and can retry there, instead of
   * losing the cart. The cart is only cleared once the order exists.
   */
  async place(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.placing.set(true);
    this.payStage.set('placing');
    this.error.set(null);

    const lines = await firstValueFrom(this.store.select(selectCartLines));
    const f = this.form.getRawValue();
    let orderId: string;

    try {
      const order = await firstValueFrom(
        this.api.post<{ _id: string; orderNumber: string }>('/orders', {
          items: lines.map((l) => ({ productId: l.productId, variantSku: l.variantSku, qty: l.qty, modifierNames: l.modifierNames ?? [] })),
          couponCode: this.appliedCode() || undefined,
          contact: { name: f.name, phone: f.phone },
          shippingAddress: { line1: f.line1, city: f.city, pincode: f.pincode },
        }),
      );
      orderId = order._id;
      this.cart.clear();
    } catch (e: unknown) {
      this.error.set((e as { message?: string })?.message ?? 'Could not place order');
      this.placing.set(false);
      this.payStage.set('idle');
      return;
    }

    this.payStage.set('paying');
    const result = await this.payments.pay(orderId, this.selectedMethod());

    // Whatever happened, the order exists — the order page shows its real state and
    // offers a retry. Nothing is silently swallowed.
    if (result.outcome === 'failed') {
      void this.router.navigate(['/order', orderId], { queryParams: { payment: 'failed', reason: result.message } });
      return;
    }
    if (result.outcome === 'cancelled') {
      void this.router.navigate(['/order', orderId], { queryParams: { payment: 'cancelled' } });
      return;
    }
    void this.router.navigate(['/order', orderId], { queryParams: { payment: result.outcome } });
  }
}
