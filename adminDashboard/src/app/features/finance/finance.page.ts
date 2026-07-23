import { Component, inject, OnInit, signal } from '@angular/core';
import { AsyncPipe, DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthFacade } from '../../store/auth/auth.facade';
import { NotificationService } from '../../core/services/notification.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

interface Wallet { available: number; lifetimeEarned: number; lifetimePaid: number; }
interface Balance { storeId: string; storeName: string; available: number; lifetimeEarned: number; lifetimePaid: number; }
interface Payout { _id: string; amount: number; status: string; createdAt: string; }

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [AsyncPipe, DecimalPipe, HasPermissionDirective],
  template: `
    <header class="head"><h1>Finance & Payouts</h1><p class="muted">Vendor balances and settlements</p></header>

    <!-- Vendor view: own wallet -->
    @if (wallet(); as w) {
      <div class="kpis">
        <div class="card kpi"><div class="v">₹{{ w.available / 100 | number: '1.0-0' }}</div><div class="muted">Available balance</div></div>
        <div class="card kpi"><div class="v">₹{{ w.lifetimeEarned / 100 | number: '1.0-0' }}</div><div class="muted">Lifetime earned</div></div>
        <div class="card kpi"><div class="v">₹{{ w.lifetimePaid / 100 | number: '1.0-0' }}</div><div class="muted">Lifetime paid out</div></div>
      </div>
      <div class="card card--flush">
        <table class="table"><thead><tr><th>Payout</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            @for (p of payouts(); track p._id) {
              <tr><td>{{ p._id.slice(-6) }}</td><td>₹{{ p.amount / 100 }}</td>
                  <td><span class="badge badge-success">{{ p.status }}</span></td><td class="muted">{{ p.createdAt.slice(0,10) }}</td></tr>
            } @empty { <tr><td colspan="4" class="pad muted">No payouts yet.</td></tr> }
          </tbody>
        </table>
      </div>
    }

    <!-- Admin view: all balances + release -->
    @if (isAdmin()) {
      <div class="card card--flush">
        <table class="table"><thead><tr><th>Store</th><th>Available</th><th>Earned</th><th>Paid</th><th></th></tr></thead>
          <tbody>
            @for (b of balances(); track b.storeId) {
              <tr>
                <td><b>{{ b.storeName }}</b></td>
                <td class="price">₹{{ b.available / 100 | number: '1.0-0' }}</td>
                <td class="muted">₹{{ b.lifetimeEarned / 100 | number: '1.0-0' }}</td>
                <td class="muted">₹{{ b.lifetimePaid / 100 | number: '1.0-0' }}</td>
                <td class="actions">
                  <button class="btn btn-primary btn-sm" [disabled]="b.available <= 0"
                          (click)="release(b)" *hasPermission="'payout:release'">Pay out</button>
                </td>
              </tr>
            } @empty { <tr><td colspan="5" class="pad muted">No vendor balances yet.</td></tr> }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-bottom: 20px; }
      .kpi .v { font-size: 1.6rem; font-weight: 800; }
      .pad { padding: 16px; } .actions { text-align: right; }
    `,
  ],
})
export class FinancePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthFacade);
  private readonly notify = inject(NotificationService);

  wallet = signal<Wallet | null>(null);
  payouts = signal<Payout[]>([]);
  balances = signal<Balance[]>([]);
  role = signal('');
  isAdmin = () => this.role() === 'super_admin' || this.role() === 'admin';

  readonly user$ = this.auth.user$;

  ngOnInit(): void {
    this.auth.user$.subscribe((u) => {
      this.role.set(u?.role ?? '');
      const isVendor = u?.role === 'vendor' || u?.role === 'vendor_staff';
      if (isVendor) {
        this.api.get<Wallet>('/payouts/wallet').subscribe({ next: (w) => this.wallet.set(w) });
        this.api.get<Payout[]>('/payouts').subscribe({ next: (p) => this.payouts.set(p) });
      }
      if (this.isAdmin()) {
        this.loadBalances();
      }
    });
  }

  loadBalances(): void {
    this.api.get<Balance[]>('/payouts/balances').subscribe({ next: (b) => this.balances.set(b) });
  }

  release(b: Balance): void {
    this.api.post('/payouts/release', { storeId: b.storeId }).subscribe({
      next: () => {
        this.notify.push('Payout sent', `₹${b.available / 100} to ${b.storeName}`, 'success');
        this.loadBalances();
      },
      error: (e) => this.notify.push('Payout failed', e?.message, 'warning'),
    });
  }
}
