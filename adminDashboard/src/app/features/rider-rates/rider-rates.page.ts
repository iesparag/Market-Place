import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface Rate {
  _id: string;
  city: string;
  ratePerKm: number; // paise
  active: boolean;
}

/**
 * ₹/km a rider earns for a delivery, set per city — deliberately opt-in per city, not
 * one nationwide number: a city with no rate here means deliveries there don't compute
 * a payout yet (see deliveryTasksService.maybeComputePayout on the backend). Set a rate
 * only for cities you're actually running "Now" instant-delivery in.
 */
@Component({
  selector: 'app-rider-rates',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule],
  template: `
    <header class="head">
      <h1>Rider Rates</h1>
      <p class="muted">₹/km a rider earns per delivery, by city — only cities listed here compute a payout</p>
    </header>
    <div class="cols">
      <div class="card card--flush list">
        <table class="table">
          <thead><tr><th>City</th><th>Rate</th><th></th></tr></thead>
          <tbody>
            @for (r of rates(); track r._id) {
              <tr>
                <td><b>{{ r.city }}</b></td>
                <td>₹{{ r.ratePerKm / 100 }}/km</td>
                <td class="actions">
                  <button class="btn btn-ghost btn-sm" (click)="toggle(r)">{{ r.active ? 'Disable' : 'Enable' }}</button>
                  <span class="badge" [class.badge-success]="r.active">{{ r.active ? 'active' : 'off' }}</span>
                  <button class="btn btn-ghost btn-sm danger" (click)="remove(r)">Delete</button>
                </td>
              </tr>
            } @empty { <tr><td colspan="3" class="pad muted">No city rates set yet — deliveries won't compute a rider payout until you add one.</td></tr> }
          </tbody>
        </table>
      </div>

      <form class="card" [formGroup]="form" (ngSubmit)="create()">
        <h3>Add a city</h3>
        <label class="label">City</label><input class="input" formControlName="city" placeholder="Ahmedabad" />
        <label class="label">Rate (₹ per km)</label><input class="input" type="number" formControlName="ratePerKm" />
        <button class="btn btn-primary" [disabled]="form.invalid">Add city rate</button>
      </form>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; }
      @media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
      .label { margin-top: 10px; } .pad { padding: 16px; }
      .actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
      .btn-primary { margin-top: 16px; }
      .danger { color: var(--danger, #dc2626); }
    `,
  ],
})
export class RiderRatesPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  rates = signal<Rate[]>([]);

  form = this.fb.nonNullable.group({
    city: ['', Validators.required],
    ratePerKm: [8, [Validators.required, Validators.min(0)]],
  });

  ngOnInit(): void { this.load(); }
  load(): void { this.api.get<Rate[]>('/rider-payout-rates').subscribe({ next: (r) => this.rates.set(r) }); }

  create(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.api.post('/rider-payout-rates', { city: v.city, ratePerKm: Math.round(v.ratePerKm * 100) }).subscribe({
      next: () => { this.notify.push('Rate added', v.city, 'success'); this.form.reset({ ratePerKm: 8 }); this.load(); },
      error: (e) => this.notify.push('Failed', e?.message, 'warning'),
    });
  }

  toggle(r: Rate): void {
    this.api.patch(`/rider-payout-rates/${r._id}`, { active: !r.active }).subscribe({ next: () => this.load() });
  }

  remove(r: Rate): void {
    this.api.delete(`/rider-payout-rates/${r._id}`).subscribe({ next: () => this.load() });
  }
}
