import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

/** Public vendor self-registration → creates a seller account + store (pending admin approval). */
@Component({
  selector: 'app-become-vendor',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="wrap">
      @if (done()) {
        <div class="card ok">
          <div class="ei">🎉</div>
          <h1>Application received!</h1>
          <p class="muted">Your store <b>{{ storeName() }}</b> is created and <b>pending approval</b>. Our team will review it shortly. Once approved, sign in to the <b>seller dashboard</b> to add products and manage orders.</p>
          <a class="btn btn-primary" routerLink="/">Back to shopping</a>
        </div>
      } @else {
        <form class="card" [formGroup]="form" (ngSubmit)="submit()">
          <h1>Sell on Marketplace</h1>
          <p class="muted">Reach thousands of customers. Fill in your details to get started.</p>
          @if (error()) { <div class="err">{{ error() }}</div> }

          <h3>Your account</h3>
          <div class="two">
            <div><label class="label">Your name *</label><input class="input" formControlName="name" /></div>
            <div><label class="label">Email *</label><input class="input" type="email" formControlName="email" /></div>
          </div>
          <div class="two">
            <div><label class="label">Password *</label><input class="input" type="password" formControlName="password" placeholder="min 8 chars" /></div>
            <div><label class="label">Phone</label><input class="input" formControlName="phone" /></div>
          </div>

          <h3>Your store</h3>
          <div class="two">
            <div><label class="label">Store name *</label><input class="input" formControlName="storeName" /></div>
            <div><label class="label">Category</label>
              <select class="input" formControlName="vendorType"><option value="food">Food</option><option value="grocery">Grocery</option><option value="fashion">Fashion</option><option value="generic">Other</option></select>
            </div>
          </div>
          <div class="two">
            <div><label class="label">GSTIN (optional)</label><input class="input" formControlName="gstin" /></div>
            <div><label class="label">City</label><input class="input" formControlName="city" /></div>
          </div>

          <button class="btn btn-primary submit" [disabled]="form.invalid || saving()">{{ saving() ? 'Submitting…' : 'Create my store' }}</button>
          <p class="muted foot">Already a seller? <a routerLink="/login">Sign in</a></p>
        </form>
      }
    </div>
  `,
  styles: [
    `
      .wrap { max-width: 640px; margin: 30px auto; }
      h3 { margin: 18px 0 8px; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      @media (max-width: 560px) { .two { grid-template-columns: 1fr; } }
      .label { margin-top: 8px; } .submit { margin-top: 18px; width: 100%; justify-content: center; }
      .foot { margin-top: 14px; text-align: center; }
      .err { background: var(--danger-bg); color: var(--danger); padding: 10px; border-radius: 8px; }
      .ok { text-align: center; padding: 44px 24px; } .ei { font-size: 3rem; } .ok h1 { margin: 8px 0; } .ok p { margin-bottom: 18px; }
    `,
  ],
})
export class BecomeVendorComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  saving = signal(false);
  done = signal(false);
  storeName = signal('');
  error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    phone: [''],
    storeName: ['', Validators.required],
    vendorType: ['generic'],
    gstin: [''],
    city: [''],
  });

  submit(): void {
    if (this.form.invalid) return;
    this.saving.set(true); this.error.set(null);
    const v = this.form.getRawValue();
    this.api.post('/auth/register-vendor', {
      name: v.name, email: v.email, password: v.password, phone: v.phone || undefined,
      storeName: v.storeName, vendorType: v.vendorType, gstin: v.gstin || undefined,
      address: { city: v.city },
    }).subscribe({
      next: () => { this.storeName.set(v.storeName); this.done.set(true); this.saving.set(false); },
      error: (e) => { this.error.set(e?.error?.error?.message ?? e?.message ?? 'Registration failed'); this.saving.set(false); },
    });
  }
}
