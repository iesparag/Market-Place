import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthFacade } from '../../store/auth/auth.facade';
import { NotificationService } from '../../core/services/notification.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

interface Wallet {
  available: number;
  pending: number;
  lifetimeEarned: number;
  lifetimePaid: number;
}
interface StatementEntry {
  at: string;
  account: string;
  amount: number;
  availableAt: string | null;
  note: string | null;
  refType: string | null;
  refId: string | null;
}
interface Statement extends Wallet {
  holdDays: number;
  entries: StatementEntry[];
}
interface PayTo {
  accountName: string;
  accountNumberMasked: string;
  ifsc: string;
  upiId: string;
  verified: boolean;
}
interface Balance extends Wallet {
  storeId: string;
  storeName: string;
  holdDays: number;
  payTo: PayTo | null;
}
interface Payout {
  _id: string;
  amount: number;
  status: string;
  reference?: string;
  note?: string;
  createdAt: string;
}

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [DecimalPipe, SlicePipe, FormsModule, HasPermissionDirective],
  template: `
    <header class="head">
      <h1>Finance &amp; Payouts</h1>
      <p class="muted">Vendor balances and settlements</p>
    </header>

    <!-- Vendor view: own wallet + statement -->
    @if (statement(); as w) {
      <div class="kpis">
        <div class="card kpi">
          <div class="v">₹{{ w.available / 100 | number: '1.0-0' }}</div>
          <div class="muted">Available to withdraw</div>
        </div>
        <div class="card kpi">
          <div class="v pending">₹{{ w.pending / 100 | number: '1.0-0' }}</div>
          <div class="muted">On hold · clears in {{ w.holdDays }} day(s)</div>
        </div>
        <div class="card kpi">
          <div class="v">₹{{ w.lifetimeEarned / 100 | number: '1.0-0' }}</div>
          <div class="muted">Lifetime earned</div>
        </div>
        <div class="card kpi">
          <div class="v">₹{{ w.lifetimePaid / 100 | number: '1.0-0' }}</div>
          <div class="muted">Lifetime paid out</div>
        </div>
      </div>

      <div class="card card--flush">
        <div class="cardhead"><b>Statement</b><span class="muted">every line behind your balance</span></div>
        <table class="table">
          <thead><tr><th>Date</th><th>Entry</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
          <tbody>
            @for (e of w.entries; track e.at + e.account + e.amount) {
              <tr>
                <td class="muted">{{ e.at | slice: 0:10 }}</td>
                <td>{{ accountLabel(e) }}</td>
                <td [class.neg]="e.amount < 0" class="price">
                  {{ e.amount < 0 ? '−' : '+' }}₹{{ abs(e.amount) / 100 | number: '1.0-2' }}
                </td>
                <td>
                  @if (isHeld(e)) {
                    <span class="badge badge-warning">clears {{ e.availableAt | slice: 0:10 }}</span>
                  } @else {
                    <span class="badge badge-success">available</span>
                  }
                </td>
                <td class="muted tiny">{{ e.refId || '—' }}</td>
              </tr>
            } @empty { <tr><td colspan="5" class="pad muted">No earnings yet.</td></tr> }
          </tbody>
        </table>
      </div>

      <div class="card card--flush">
        <div class="cardhead"><b>Payouts received</b></div>
        <table class="table">
          <thead><tr><th>Payout</th><th>Amount</th><th>Status</th><th>Reference</th><th>Date</th></tr></thead>
          <tbody>
            @for (p of payouts(); track p._id) {
              <tr>
                <td>{{ p._id.slice(-6) }}</td>
                <td class="price">₹{{ p.amount / 100 }}</td>
                <td><span class="badge badge-success">{{ p.status }}</span></td>
                <td class="muted tiny">{{ p.reference || '—' }}</td>
                <td class="muted">{{ p.createdAt | slice: 0:10 }}</td>
              </tr>
            } @empty { <tr><td colspan="5" class="pad muted">No payouts yet.</td></tr> }
          </tbody>
        </table>
      </div>
    }

    <!-- Admin view: settle every vendor -->
    @if (isAdmin()) {
      <div class="card card--flush">
        <div class="cardhead">
          <b>Vendor balances</b>
          <span class="muted">"Available" excludes earnings still inside the {{ holdDays() }}-day hold</span>
        </div>
        <table class="table">
          <thead><tr><th>Store</th><th>Available</th><th>On hold</th><th>Earned</th><th>Paid</th><th>Pay to</th><th></th></tr></thead>
          <tbody>
            @for (b of balances(); track b.storeId) {
              <tr>
                <td><b>{{ b.storeName }}</b></td>
                <td class="price" [class.neg]="b.available < 0">₹{{ b.available / 100 | number: '1.0-0' }}</td>
                <td class="muted">₹{{ b.pending / 100 | number: '1.0-0' }}</td>
                <td class="muted">₹{{ b.lifetimeEarned / 100 | number: '1.0-0' }}</td>
                <td class="muted">₹{{ b.lifetimePaid / 100 | number: '1.0-0' }}</td>
                <td class="tiny">
                  @if (b.payTo; as d) {
                    <div>{{ d.accountName }}</div>
                    <div class="muted">{{ d.upiId || d.accountNumberMasked + ' · ' + d.ifsc }}</div>
                    @if (!d.verified) { <span class="badge badge-warning">unverified</span> }
                  } @else {
                    <span class="muted">no bank details</span>
                  }
                </td>
                <td class="actions">
                  <button class="btn btn-primary btn-sm" [disabled]="b.available <= 0"
                          (click)="startPayout(b)" *hasPermission="'payout:release'">Settle</button>
                </td>
              </tr>
            } @empty { <tr><td colspan="7" class="pad muted">No vendor balances yet.</td></tr> }
          </tbody>
        </table>
      </div>
    }

    <!-- Settle dialog -->
    @if (settling(); as b) {
      <div class="backdrop" (click)="settling.set(null)"></div>
      <div class="modal card">
        <h3>Settle {{ b.storeName }}</h3>
        <p class="muted">
          Available <b>₹{{ b.available / 100 }}</b>@if (b.pending > 0) { · ₹{{ b.pending / 100 }} still on hold }.
        </p>
        @if (b.payTo; as d) {
          <div class="bank">
            <div><b>{{ d.accountName }}</b></div>
            @if (d.upiId) { <div>UPI · {{ d.upiId }}</div> }
            @if (d.accountNumberMasked) { <div>{{ d.accountNumberMasked }} · {{ d.ifsc }}</div> }
          </div>
        } @else {
          <div class="warn">This vendor has no bank details saved — add them on the store before settling.</div>
        }
        <label class="label">Amount (₹)</label>
        <input class="input" type="number" [(ngModel)]="payoutAmount" [max]="b.available / 100" />
        <label class="label">Bank / UPI reference (UTR)</label>
        <input class="input" [(ngModel)]="payoutReference" placeholder="e.g. 412345678901" />
        <label class="label">Note (optional)</label>
        <input class="input" [(ngModel)]="payoutNote" placeholder="Weekly settlement" />
        @if (payoutError()) { <div class="err">{{ payoutError() }}</div> }
        <div class="mactions">
          <button class="btn btn-ghost" (click)="settling.set(null)">Cancel</button>
          <button class="btn btn-primary" [disabled]="busy()" (click)="confirmPayout(b)">
            {{ busy() ? 'Recording…' : 'Mark ₹' + payoutAmount + ' paid' }}
          </button>
        </div>
        <p class="muted tiny">
          Transfer the money from your bank/UPI first, then record the reference here.
          This writes the ledger entry and notifies the vendor.
        </p>
      </div>
    }
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-bottom: 20px; }
      .kpi .v { font-size: 1.6rem; font-weight: 800; }
      .kpi .v.pending { color: var(--text-muted); }
      .cardhead { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
      .pad { padding: 16px; } .actions { text-align: right; }
      .tiny { font-size: 0.75rem; }
      .neg { color: var(--danger); }
      .bank { background: var(--surface-2); padding: 10px 12px; border-radius: 8px; margin: 10px 0; font-size: 0.85rem; }
      .warn { background: var(--danger-bg); color: var(--danger); padding: 10px 12px; border-radius: 8px; margin: 10px 0; font-size: 0.85rem; }
      .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 40; }
      .modal { position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(440px, 92vw); }
      .modal .label { margin-top: 10px; }
      .mactions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
      .err { color: var(--danger); font-size: 0.85rem; margin-top: 10px; }
    `,
  ],
})
export class FinancePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthFacade);
  private readonly notify = inject(NotificationService);

  statement = signal<Statement | null>(null);
  payouts = signal<Payout[]>([]);
  balances = signal<Balance[]>([]);
  settling = signal<Balance | null>(null);
  payoutError = signal<string | null>(null);
  busy = signal(false);
  role = signal('');

  payoutAmount = 0;
  payoutReference = '';
  payoutNote = '';

  isAdmin = (): boolean => this.role() === 'super_admin' || this.role() === 'admin';
  holdDays = (): number => this.balances()[0]?.holdDays ?? 0;
  abs = (n: number): number => Math.abs(n);

  /** A credit still inside the payout hold window. */
  isHeld(e: StatementEntry): boolean {
    return e.account === 'vendor_payable' && !!e.availableAt && new Date(e.availableAt) > new Date();
  }

  accountLabel(e: StatementEntry): string {
    if (e.note) return e.note;
    return (
      {
        vendor_payable: e.amount < 0 ? 'Commission / refund adjustment' : 'Order earnings',
        vendor_paid: 'Payout to your account',
        commission_income: 'Platform commission',
        refund: 'Refund',
        platform_cash: 'Collected',
      }[e.account] ?? e.account
    );
  }

  ngOnInit(): void {
    this.auth.user$.subscribe((u) => {
      this.role.set(u?.role ?? '');
      const isVendor = u?.role === 'vendor' || u?.role === 'vendor_staff';
      if (isVendor) {
        this.api.get<Statement>('/payouts/statement').subscribe({ next: (w) => this.statement.set(w) });
        this.api.get<Payout[]>('/payouts').subscribe({ next: (p) => this.payouts.set(p) });
      }
      if (this.isAdmin()) this.loadBalances();
    });
  }

  loadBalances(): void {
    this.api.get<Balance[]>('/payouts/balances').subscribe({ next: (b) => this.balances.set(b) });
  }

  startPayout(b: Balance): void {
    this.payoutError.set(null);
    this.payoutReference = '';
    this.payoutNote = '';
    this.payoutAmount = b.available / 100;
    this.settling.set(b);
  }

  confirmPayout(b: Balance): void {
    const paise = Math.round(this.payoutAmount * 100);
    if (paise <= 0 || paise > b.available) {
      this.payoutError.set(`Enter an amount between ₹1 and ₹${b.available / 100}`);
      return;
    }
    this.busy.set(true);
    this.api
      .post('/payouts/release', {
        storeId: b.storeId,
        amount: paise,
        reference: this.payoutReference || undefined,
        note: this.payoutNote || undefined,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.settling.set(null);
          this.notify.push('Payout recorded', `₹${paise / 100} to ${b.storeName}`, 'success');
          this.loadBalances();
        },
        error: (e) => {
          this.busy.set(false);
          this.payoutError.set(e?.message ?? 'Payout failed');
        },
      });
  }
}
