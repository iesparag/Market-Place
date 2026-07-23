import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface Coupon {
  _id: string; code: string; type: 'percent' | 'flat'; value: number;
  minSubtotal?: number; maxDiscount?: number; active: boolean; usedCount: number;
}

@Component({
  selector: 'app-coupons',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="head"><h1>Coupons</h1><p class="muted">Discount codes customers apply at checkout</p></header>
    <div class="cols">
      <div class="card card--flush list">
        <table class="table">
          <thead><tr><th>Code</th><th>Discount</th><th>Min</th><th>Used</th><th></th></tr></thead>
          <tbody>
            @for (c of coupons(); track c._id) {
              <tr>
                <td><b>{{ c.code }}</b></td>
                <td>{{ c.type === 'percent' ? c.value + '%' : '₹' + c.value / 100 }}</td>
                <td class="muted">{{ c.minSubtotal ? '₹' + c.minSubtotal / 100 : '—' }}</td>
                <td>{{ c.usedCount }}</td>
                <td class="actions">
                  <button class="btn btn-ghost btn-sm" (click)="toggle(c)">{{ c.active ? 'Disable' : 'Enable' }}</button>
                  <span class="badge" [class.badge-success]="c.active">{{ c.active ? 'active' : 'off' }}</span>
                </td>
              </tr>
            } @empty { <tr><td colspan="5" class="pad muted">No coupons yet.</td></tr> }
          </tbody>
        </table>
      </div>

      <form class="card" [formGroup]="form" (ngSubmit)="create()">
        <h3>New coupon</h3>
        <label class="label">Code</label><input class="input" formControlName="code" placeholder="SAVE10" />
        <div class="two">
          <div><label class="label">Type</label>
            <select class="input" formControlName="type"><option value="percent">percent</option><option value="flat">flat ₹</option></select>
          </div>
          <div><label class="label">Value</label><input class="input" type="number" formControlName="value" /></div>
        </div>
        <div class="two">
          <div><label class="label">Min order ₹</label><input class="input" type="number" formControlName="minSubtotal" /></div>
          <div><label class="label">Max discount ₹</label><input class="input" type="number" formControlName="maxDiscount" /></div>
        </div>
        <button class="btn btn-primary" [disabled]="form.invalid">Create coupon</button>
      </form>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; }
      @media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .label { margin-top: 10px; } .pad { padding: 16px; }
      .actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
      .btn-primary { margin-top: 16px; }
    `,
  ],
})
export class CouponsPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  coupons = signal<Coupon[]>([]);

  form = this.fb.nonNullable.group({
    code: ['', Validators.required],
    type: ['percent'],
    value: [10, [Validators.required, Validators.min(1)]],
    minSubtotal: [0],
    maxDiscount: [0],
  });

  ngOnInit(): void { this.load(); }
  load(): void { this.api.get<Coupon[]>('/coupons').subscribe({ next: (c) => this.coupons.set(c) }); }

  create(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body = {
      code: v.code, type: v.type, value: v.type === 'flat' ? v.value * 100 : v.value,
      minSubtotal: (v.minSubtotal || 0) * 100,
      maxDiscount: v.maxDiscount ? v.maxDiscount * 100 : undefined,
    };
    this.api.post('/coupons', body).subscribe({
      next: () => { this.notify.push('Coupon created', v.code, 'success'); this.form.reset({ type: 'percent', value: 10, minSubtotal: 0, maxDiscount: 0 }); this.load(); },
      error: (e) => this.notify.push('Failed', e?.message, 'warning'),
    });
  }

  toggle(c: Coupon): void {
    this.api.patch(`/coupons/${c._id}`, { active: !c.active }).subscribe({ next: () => this.load() });
  }
}
