import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface AbandonedCart {
  userId: string; name: string; email: string; phone: string;
  itemCount: number; total: number; firstAbandonedAt: string; remindersSent: number;
}
interface Coupon { _id: string; code: string; type: 'percent' | 'flat'; value: number; active: boolean }
interface WaTemplate { _id: string; name: string; status: string; variableCount: number }

/** Everyone currently sitting on an abandoned cart — pick who, attach a coupon, blast
 * a one-off recovery offer via push + WhatsApp in a single click. The automatic daily
 * evening reminder (jobs/schedulers/cart-reminder-sweep.ts) handles the routine nudge;
 * this is for a hand-crafted campaign (end-of-sale push, bigger one-off discount). */
@Component({
  selector: 'app-cart-recovery',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <header class="head"><h1>Cart Recovery</h1><p class="muted">Customers with items sitting in their cart right now</p></header>

    <div class="cols">
      <div class="card card--flush list">
        <table class="table">
          <thead>
            <tr>
              <th><input type="checkbox" [checked]="allSelected()" (change)="toggleAll($event)" /></th>
              <th>Customer</th><th>Items</th><th>Total</th><th>Abandoned</th><th>Reminders</th>
            </tr>
          </thead>
          <tbody>
            @for (c of carts(); track c.userId) {
              <tr>
                <td><input type="checkbox" [checked]="selected().has(c.userId)" (change)="toggle(c.userId)" /></td>
                <td><b>{{ c.name || c.phone || c.email }}</b><br /><span class="muted small">{{ c.email }}</span></td>
                <td>{{ c.itemCount }}</td>
                <td>₹{{ c.total / 100 }}</td>
                <td class="muted">{{ c.firstAbandonedAt | date: 'd MMM, h:mm a' }}</td>
                <td>{{ c.remindersSent }} / 5</td>
              </tr>
            } @empty { <tr><td colspan="6" class="pad muted">No abandoned carts right now.</td></tr> }
          </tbody>
        </table>
      </div>

      <form class="card" (ngSubmit)="send()">
        <h3>Recovery offer</h3>
        <p class="muted small">{{ selected().size }} customer(s) selected</p>

        <label class="label">Title</label>
        <input class="input" [(ngModel)]="title" name="title" />

        <label class="label">Message (leave blank for an auto-generated one per customer)</label>
        <textarea class="input" rows="2" [(ngModel)]="body" name="body"></textarea>

        <label class="label">Coupon (optional)</label>
        <select class="input" [(ngModel)]="couponCode" name="coupon">
          <option value="">None</option>
          @for (c of coupons(); track c._id) {
            <option [value]="c.code">{{ c.code }} — {{ c.type === 'percent' ? c.value + '%' : '₹' + c.value / 100 }}</option>
          }
        </select>

        <label class="label">Image URL (optional)</label>
        <input class="input" [(ngModel)]="image" name="image" placeholder="https://…" />

        <label class="label">Send via</label>
        <div class="checks">
          <label><input type="checkbox" [(ngModel)]="viaPush" name="viaPush" /> Push notification</label>
          <label><input type="checkbox" [(ngModel)]="viaWhatsapp" name="viaWhatsapp" /> WhatsApp</label>
        </div>

        @if (viaWhatsapp) {
          @if (!waConfigured()) {
            <div class="warn">WhatsApp isn't configured yet (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) — messages will be skipped. See WhatsApp Templates page.</div>
          }
          <label class="label">Template (must be approved)</label>
          <select class="input" [(ngModel)]="templateName" name="template">
            <option value="">Select…</option>
            @for (t of approvedTemplates(); track t._id) {
              <option [value]="t.name">{{ t.name }}</option>
            }
          </select>
          @if (!approvedTemplates().length) { <p class="muted small">No approved templates yet.</p> }
        }

        @if (result()) { <div class="ok">{{ result() }}</div> }
        <button class="btn btn-primary" [disabled]="!selected().size || sending() || (!viaPush && !viaWhatsapp)">
          {{ sending() ? 'Sending…' : '🎯 Send recovery offer' }}
        </button>
      </form>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; }
      @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
      .label { margin-top: 10px; display: block; } .pad { padding: 16px; } .small { font-size: 0.8rem; }
      .btn-primary { margin-top: 16px; }
      .ok { background: var(--success-bg, #e7f8ee); color: var(--success, #15803d); padding: 10px; border-radius: 8px; margin-top: 10px; font-weight: 600; }
      .warn { background: #fff7e6; color: #92610a; padding: 8px 10px; border-radius: 8px; font-size: 0.82rem; margin-top: 8px; }
      .checks { display: flex; gap: 16px; margin-top: 6px; font-size: 0.88rem; }
      .checks label { display: flex; align-items: center; gap: 6px; }
    `,
  ],
})
export class CartRecoveryPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  carts = signal<AbandonedCart[]>([]);
  coupons = signal<Coupon[]>([]);
  templates = signal<WaTemplate[]>([]);
  waConfigured = signal(false);
  selected = signal<Set<string>>(new Set());
  sending = signal(false);
  result = signal<string | null>(null);

  title = 'Your cart is waiting 🛒';
  body = '';
  couponCode = '';
  image = '';
  viaPush = true;
  viaWhatsapp = false;
  templateName = '';

  approvedTemplates = computed(() => this.templates().filter((t) => t.status === 'approved'));
  allSelected = computed(() => this.carts().length > 0 && this.selected().size === this.carts().length);

  ngOnInit(): void {
    this.api.get<AbandonedCart[]>('/cart/abandoned').subscribe((c) => this.carts.set(c));
    this.api.get<Coupon[]>('/coupons').subscribe((c) => this.coupons.set(c.filter((x) => x.active)));
    this.api.get<WaTemplate[]>('/whatsapp/templates').subscribe((t) => this.templates.set(t));
    this.api.get<{ configured: boolean }>('/whatsapp/configured').subscribe((r) => this.waConfigured.set(r.configured));
  }

  toggle(userId: string): void {
    const next = new Set(this.selected());
    next.has(userId) ? next.delete(userId) : next.add(userId);
    this.selected.set(next);
  }

  toggleAll(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selected.set(checked ? new Set(this.carts().map((c) => c.userId)) : new Set());
  }

  send(): void {
    if (!this.selected().size) return;
    this.sending.set(true);
    this.result.set(null);
    const channels = [...(this.viaPush ? ['push'] : []), ...(this.viaWhatsapp ? ['whatsapp'] : [])];
    this.api
      .post<{ targeted: number; pushSent: number; whatsappSent: number }>('/cart/recovery-campaign', {
        userIds: [...this.selected()],
        title: this.title,
        body: this.body,
        couponCode: this.couponCode || undefined,
        image: this.image || undefined,
        channels,
        whatsappTemplateName: this.templateName || undefined,
      })
      .subscribe({
        next: (r) => {
          this.sending.set(false);
          this.result.set(`${r.pushSent} push · ${r.whatsappSent} WhatsApp sent (of ${r.targeted} targeted).`);
          this.notify.push('Recovery campaign sent', `${r.targeted} customer(s)`, 'success');
        },
        error: (e) => { this.sending.set(false); this.notify.push('Send failed', e?.message, 'warning'); },
      });
  }
}
