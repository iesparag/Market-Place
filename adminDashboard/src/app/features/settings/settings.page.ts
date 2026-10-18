import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface FeatureFlags {
  couponsEnabled: boolean;
  loyaltyEnabled: boolean;
  referralEnabled: boolean;
  frequentlyBoughtTogetherEnabled: boolean;
  wishlistPriceDropAlertsEnabled: boolean;
  recentlyViewedEnabled: boolean;
  checkoutAdBannerEnabled: boolean;
}
interface Settings {
  commissionPercent: number; taxPercent: number; deliveryFee: number; freeDeliveryAbove: number;
  localDeliveryBaseFee?: number; localDeliveryBaseKm?: number; localDeliveryPerKmFee?: number; thirdPartyDeliveryFee?: number;
  payoutHoldDays: number; currency: string;
  codEnabled: boolean; codMaxOrderValue: number; onlinePaymentEnabled: boolean; paymentExpiryMinutes: number;
  loyaltyEarnDivisor: number; loyaltyPointValuePaise: number; loyaltyMaxRedeemShare: number;
  referralRewardPoints: number;
  features?: FeatureFlags;
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
      <h3 class="section">Delivery Pricing (Local Now vs Third-Party Courier)</h3>
      <label class="label">Local base delivery fee (₹)</label>
      <input class="input" type="number" formControlName="localDeliveryBaseFee" />
      <label class="label">Local base distance covered (km)</label>
      <input class="input" type="number" formControlName="localDeliveryBaseKm" />
      <label class="label">Local extra fee per km (₹/km)</label>
      <input class="input" type="number" formControlName="localDeliveryPerKmFee" />
      <label class="label">Third-party courier flat fee per vendor (₹)</label>
      <input class="input" type="number" formControlName="thirdPartyDeliveryFee" />
      <p class="hint">Applied to intercity / non-local vendors fulfilling via standard courier.</p>
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

      <h3 class="section">Loyalty & referral</h3>
      <label class="label">Customer spends ₹ to earn 1 point</label>
      <input class="input" type="number" formControlName="loyaltyEarnRupees" />
      <label class="label">1 point is worth (₹)</label>
      <input class="input" type="number" step="0.01" formControlName="loyaltyPointValueRupees" />
      <label class="label">Max share of an order points can discount (%)</label>
      <input class="input" type="number" formControlName="loyaltyMaxRedeemSharePercent" />
      <p class="hint">Points can never fully zero out an order — this caps how much of the subtotal they can cover.</p>
      <label class="label">Referral reward (points) — paid when an invite's first order is delivered</label>
      <input class="input" type="number" formControlName="referralRewardPoints" />

      <h3 class="section">Features</h3>
      <p class="hint">Turn any of these off instantly for both the app and the website — no rebuild needed.</p>
      <label class="check"><input type="checkbox" formControlName="couponsEnabled" /><span>Coupon codes at checkout</span></label>
      <label class="check"><input type="checkbox" formControlName="loyaltyEnabled" /><span>Loyalty points (earn + redeem)</span></label>
      <label class="check"><input type="checkbox" formControlName="referralEnabled" /><span>Referral rewards</span></label>
      <label class="check"><input type="checkbox" formControlName="frequentlyBoughtTogetherEnabled" /><span>Frequently bought together</span></label>
      <label class="check"><input type="checkbox" formControlName="wishlistPriceDropAlertsEnabled" /><span>Wishlist price-drop alerts</span></label>
      <label class="check"><input type="checkbox" formControlName="recentlyViewedEnabled" /><span>Recently viewed</span></label>
      <label class="check"><input type="checkbox" formControlName="checkoutAdBannerEnabled" /><span>Checkout ad banner</span></label>

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
    localDeliveryBaseFee: [30, [Validators.required, Validators.min(0)]],
    localDeliveryBaseKm: [3, [Validators.required, Validators.min(0)]],
    localDeliveryPerKmFee: [10, [Validators.required, Validators.min(0)]],
    thirdPartyDeliveryFee: [70, [Validators.required, Validators.min(0)]],
    payoutHoldDays: [2, [Validators.required, Validators.min(0)]],
    onlinePaymentEnabled: [true],
    codEnabled: [true],
    codMaxOrderValue: [5000, [Validators.required, Validators.min(0)]],
    paymentExpiryMinutes: [30, [Validators.required, Validators.min(0), Validators.max(1440)]],
    loyaltyEarnRupees: [10, [Validators.required, Validators.min(1)]],
    loyaltyPointValueRupees: [0.1, [Validators.required, Validators.min(0.01)]],
    loyaltyMaxRedeemSharePercent: [50, [Validators.required, Validators.min(0), Validators.max(100)]],
    referralRewardPoints: [1000, [Validators.required, Validators.min(0)]],
    couponsEnabled: [true],
    loyaltyEnabled: [true],
    referralEnabled: [true],
    frequentlyBoughtTogetherEnabled: [true],
    wishlistPriceDropAlertsEnabled: [true],
    recentlyViewedEnabled: [true],
    checkoutAdBannerEnabled: [true],
  });

  ngOnInit(): void {
    this.api.get<Settings>('/settings').subscribe({
      next: (s) =>
        this.form.patchValue({
          commissionPercent: s.commissionPercent,
          taxPercent: s.taxPercent,
          deliveryFee: s.deliveryFee / 100,
          freeDeliveryAbove: s.freeDeliveryAbove / 100,
          localDeliveryBaseFee: (s.localDeliveryBaseFee ?? 3000) / 100,
          localDeliveryBaseKm: s.localDeliveryBaseKm ?? 3,
          localDeliveryPerKmFee: (s.localDeliveryPerKmFee ?? 1000) / 100,
          thirdPartyDeliveryFee: (s.thirdPartyDeliveryFee ?? 7000) / 100,
          payoutHoldDays: s.payoutHoldDays,
          onlinePaymentEnabled: s.onlinePaymentEnabled !== false,
          codEnabled: s.codEnabled !== false,
          codMaxOrderValue: (s.codMaxOrderValue ?? 0) / 100,
          paymentExpiryMinutes: s.paymentExpiryMinutes ?? 30,
          loyaltyEarnRupees: (s.loyaltyEarnDivisor ?? 1000) / 100,
          loyaltyPointValueRupees: (s.loyaltyPointValuePaise ?? 10) / 100,
          loyaltyMaxRedeemSharePercent: (s.loyaltyMaxRedeemShare ?? 0.5) * 100,
          referralRewardPoints: s.referralRewardPoints ?? 1000,
          couponsEnabled: s.features?.couponsEnabled !== false,
          loyaltyEnabled: s.features?.loyaltyEnabled !== false,
          referralEnabled: s.features?.referralEnabled !== false,
          frequentlyBoughtTogetherEnabled: s.features?.frequentlyBoughtTogetherEnabled !== false,
          wishlistPriceDropAlertsEnabled: s.features?.wishlistPriceDropAlertsEnabled !== false,
          recentlyViewedEnabled: s.features?.recentlyViewedEnabled !== false,
          checkoutAdBannerEnabled: s.features?.checkoutAdBannerEnabled !== false,
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
      localDeliveryBaseFee: Math.round(v.localDeliveryBaseFee * 100),
      localDeliveryBaseKm: v.localDeliveryBaseKm,
      localDeliveryPerKmFee: Math.round(v.localDeliveryPerKmFee * 100),
      thirdPartyDeliveryFee: Math.round(v.thirdPartyDeliveryFee * 100),
      payoutHoldDays: v.payoutHoldDays,
      onlinePaymentEnabled: v.onlinePaymentEnabled,
      codEnabled: v.codEnabled,
      codMaxOrderValue: Math.round(v.codMaxOrderValue * 100),
      paymentExpiryMinutes: v.paymentExpiryMinutes,
      loyaltyEarnDivisor: Math.round(v.loyaltyEarnRupees * 100),
      loyaltyPointValuePaise: Math.round(v.loyaltyPointValueRupees * 100),
      loyaltyMaxRedeemShare: v.loyaltyMaxRedeemSharePercent / 100,
      referralRewardPoints: v.referralRewardPoints,
      features: {
        couponsEnabled: v.couponsEnabled,
        loyaltyEnabled: v.loyaltyEnabled,
        referralEnabled: v.referralEnabled,
        frequentlyBoughtTogetherEnabled: v.frequentlyBoughtTogetherEnabled,
        wishlistPriceDropAlertsEnabled: v.wishlistPriceDropAlertsEnabled,
        recentlyViewedEnabled: v.recentlyViewedEnabled,
        checkoutAdBannerEnabled: v.checkoutAdBannerEnabled,
      },
    };
    this.api.patch('/settings', body).subscribe({
      next: () => { this.notify.push('Settings saved', undefined, 'success'); this.saving.set(false); },
      error: (e) => { this.notify.push('Failed', e?.message, 'warning'); this.saving.set(false); },
    });
  }
}
