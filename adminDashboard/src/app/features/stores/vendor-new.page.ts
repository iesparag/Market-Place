import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

/** Super-admin onboards a vendor on their behalf — creates the seller account + store. */
@Component({
  selector: 'app-vendor-new',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <header class="head">
      <div><h1>Add vendor</h1><p class="muted">Create a seller account + store</p></div>
      <a class="btn btn-ghost" routerLink="/stores">← Back</a>
    </header>

    <form [formGroup]="form" (ngSubmit)="submit()">
      <div class="card">
        <h3>Owner login</h3>
        <div class="two">
          <div><label class="label">Owner name *</label><input class="input" formControlName="name" /></div>
          <div><label class="label">Email *</label><input class="input" type="email" formControlName="email" /></div>
        </div>
        <div class="two">
          <div><label class="label">Password *</label><input class="input" type="text" formControlName="password" placeholder="min 8 chars" /></div>
          <div><label class="label">Phone</label><input class="input" formControlName="phone" /></div>
        </div>
      </div>

      <div class="card">
        <h3>Store</h3>
        <div class="two">
          <div><label class="label">Store name *</label><input class="input" formControlName="storeName" /></div>
          <div><label class="label">Type</label>
            <select class="input" formControlName="vendorType"><option>food</option><option>grocery</option><option>fashion</option><option>generic</option><option>integration</option></select>
          </div>
        </div>
        <div class="two">
          <div><label class="label">GSTIN</label><input class="input" formControlName="gstin" /></div>
          <div><label class="label">PAN</label><input class="input" formControlName="pan" /></div>
        </div>
        <label class="label">Address line</label><input class="input" formControlName="line1" />
        <div class="three">
          <div><label class="label">City</label><input class="input" formControlName="city" /></div>
          <div><label class="label">State</label><input class="input" formControlName="state" /></div>
          <div><label class="label">Pincode</label><input class="input" formControlName="pincode" /></div>
        </div>
      </div>

      @if (error()) { <div class="card err">{{ error() }}</div> }
      <div class="actions">
        <button class="btn btn-primary" [disabled]="form.invalid || saving()">{{ saving() ? 'Creating…' : 'Create vendor' }}</button>
        <span class="muted small">Store starts as <b>pending</b> — approve it from Vendors, then fill full profile.</span>
      </div>
    </form>
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .card { margin-bottom: 18px; } .card h3 { margin-bottom: 10px; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
      .label { margin-top: 10px; } .small { font-size: 0.8rem; margin-left: 12px; }
      .err { background: var(--danger-bg); color: var(--danger); }
      .actions { display: flex; align-items: center; }
    `,
  ],
})
export class VendorNewPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  saving = signal(false);
  error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    phone: [''],
    storeName: ['', Validators.required],
    vendorType: ['generic'],
    gstin: [''], pan: [''],
    line1: [''], city: [''], state: [''], pincode: [''],
  });

  submit(): void {
    if (this.form.invalid) return;
    this.saving.set(true); this.error.set(null);
    const v = this.form.getRawValue();
    this.api.post('/auth/register-vendor', {
      name: v.name, email: v.email, password: v.password, phone: v.phone || undefined,
      storeName: v.storeName, vendorType: v.vendorType, gstin: v.gstin || undefined, pan: v.pan || undefined,
      address: { line1: v.line1, city: v.city, state: v.state, pincode: v.pincode },
    }).subscribe({
      next: () => { this.notify.push('Vendor created', v.storeName, 'success'); void this.router.navigate(['/stores']); },
      error: (e) => { this.error.set(e?.message ?? 'Failed to create vendor'); this.saving.set(false); },
    });
  }
}
