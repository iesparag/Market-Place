import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface Settings {
  commissionPercent: number; taxPercent: number; deliveryFee: number; freeDeliveryAbove: number;
  payoutHoldDays: number; currency: string;
  codEnabled: boolean; codMaxOrderValue: number; onlinePaymentEnabled: boolean; paymentExpiryMinutes: number;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="head"><h1>Platform settings</h1><p class="muted">Commission & payout policy</p></header>
    <form class="card" [formGroup]="form" (ngSubmit)="save()" style="max-width:420px">
      <label class="label">Default commission (%)</label>
      <input class="input" type="number" formControlName="commissionPercent" />
      <label class="label">Tax / GST (%)</label>
      <input class="input" type="number" formControlName="taxPercent" />
      <label class="label">Delivery fee (₹)</label>
      <input class="input" type="number" formControlName="deliveryFee" />
      <label class="label">Free delivery above (₹)</label>
      <input class="input" type="number" formControlName="freeDeliveryAbove" />
      <label class="label">Payout hold (days)</label>
      <input class="input" type="number" formControlName="payoutHoldDays" />
      <p class="hint">Vendor earnings stay on hold this long after payment before they can be settled.</p>

      <h3 class="section">Checkout payment methods</h3>
      <label class="check">
        <input type="checkbox" formControlName="onlinePaymentEnabled" />
        <span>Online payment (UPI / card / netbanking)</span>
      </label>
      <label class="check">
        <input type="checkbox" formControlName="codEnabled" />
        <span>Cash on delivery</span>
      </label>
      <label class="label">COD limit (₹) — 0 for no limit</label>
      <input class="input" type="number" formControlName="codMaxOrderValue" />
      <p class="hint">Orders above this total can only be paid online.</p>

      <label class="label">Cancel unpaid orders after (minutes)</label>
      <input class="input" type="number" formControlName="paymentExpiryMinutes" />
      <p class="hint">An online order that is never paid is cancelled and its stock returned. 0 disables this.</p>

      <button class="btn btn-primary" [disabled]="form.invalid || saving()">{{ saving() ? 'Saving…' : 'Save settings' }}</button>
    </form>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .label { margin-top: 10px; }
      .btn-primary { margin-top: 16px; }
      .section { margin: 24px 0 4px; padding-top: 18px; border-top: 1px solid var(--border); }
      .check { display: flex; align-items: center; gap: 8px; margin-top: 10px; cursor: pointer; }
      .check input { width: auto; }
      .hint { font-size: 0.78rem; color: var(--text-muted); margin: 4px 0 0; }
    `,
  ],
})
export class SettingsPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  saving = signal(false);

  form = this.fb.nonNullable.group({
    commissionPercent: [15, [Validators.required, Validators.min(0), Validators.max(90)]],
    taxPercent: [5, [Validators.required, Validators.min(0), Validators.max(50)]],
    deliveryFee: [40, [Validators.required, Validators.min(0)]],
    freeDeliveryAbove: [500, [Validators.required, Validators.min(0)]],
    payoutHoldDays: [2, [Validators.required, Validators.min(0)]],
    onlinePaymentEnabled: [true],
    codEnabled: [true],
    codMaxOrderValue: [5000, [Validators.required, Validators.min(0)]],
    paymentExpiryMinutes: [30, [Validators.required, Validators.min(0), Validators.max(1440)]],
  });

  ngOnInit(): void {
    this.api.get<Settings>('/settings').subscribe({
      next: (s) =>
        this.form.patchValue({
          commissionPercent: s.commissionPercent,
          taxPercent: s.taxPercent,
          deliveryFee: s.deliveryFee / 100,
          freeDeliveryAbove: s.freeDeliveryAbove / 100,
          payoutHoldDays: s.payoutHoldDays,
          onlinePaymentEnabled: s.onlinePaymentEnabled !== false,
          codEnabled: s.codEnabled !== false,
          codMaxOrderValue: (s.codMaxOrderValue ?? 0) / 100,
          paymentExpiryMinutes: s.paymentExpiryMinutes ?? 30,
        }),
    });
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    const body = {
      commissionPercent: v.commissionPercent,
      taxPercent: v.taxPercent,
      deliveryFee: Math.round(v.deliveryFee * 100),
      freeDeliveryAbove: Math.round(v.freeDeliveryAbove * 100),
      payoutHoldDays: v.payoutHoldDays,
      onlinePaymentEnabled: v.onlinePaymentEnabled,
      codEnabled: v.codEnabled,
      codMaxOrderValue: Math.round(v.codMaxOrderValue * 100),
      paymentExpiryMinutes: v.paymentExpiryMinutes,
    };
    this.api.patch('/settings', body).subscribe({
      next: () => { this.notify.push('Settings saved', undefined, 'success'); this.saving.set(false); },
      error: (e) => { this.notify.push('Failed', e?.message, 'warning'); this.saving.set(false); },
    });
  }
}
