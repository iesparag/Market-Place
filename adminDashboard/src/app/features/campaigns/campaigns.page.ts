import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface Coupon { _id: string; code: string; type: 'percent' | 'flat'; value: number; active: boolean }
interface WaTemplate { _id: string; name: string; status: string; variableCount: number }
interface Category { _id: string; name: string; slug: string }
interface Store { _id: string; name: string; vendorType: string }

type SegmentType = 'all_customers' | 'cart_abandoners' | 'favourited_vendor_type' | 'wishlist_category' | 'store_favouriters';

const VENDOR_TYPES = ['food', 'grocery', 'fashion', 'generic', 'integration'] as const;

/**
 * Send a promo/update to any audience, on demand — not a cart-abandoner list (that's
 * Cart Recovery), a free pick of WHO: every customer, people who favourited a kind of
 * vendor, people who wishlisted something in a category, or people who favourited one
 * specific store. This is the "new vendor joined, tell the customers who'd care" tool —
 * deliberately two clicks (pick segment → preview count → send), not an automatic
 * trigger, so nothing ever goes out without a human choosing the audience and copy.
 */
@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="head"><h1>Campaigns</h1><p class="muted">Send a push / WhatsApp message to any customer segment, on demand</p></header>

    <form class="card" (ngSubmit)="send()">
      <h3>1. Who should get this?</h3>
      <select class="input" [(ngModel)]="segmentType" name="segmentType" (ngModelChange)="onSegmentChange()">
        <option value="all_customers">All customers</option>
        <option value="cart_abandoners">Customers with items in cart right now</option>
        <option value="favourited_vendor_type">Customers who favourited a {{ vendorTypeLabel() }} store</option>
        <option value="wishlist_category">Customers who wishlisted something in a category</option>
        <option value="store_favouriters">Customers who favourited one specific store</option>
      </select>

      @if (segmentType === 'favourited_vendor_type') {
        <label class="label">Vendor type</label>
        <select class="input" [(ngModel)]="vendorType" name="vendorType" (ngModelChange)="refreshCount()">
          @for (v of vendorTypes; track v) { <option [value]="v">{{ v }}</option> }
        </select>
      }

      @if (segmentType === 'wishlist_category') {
        <label class="label">Category</label>
        <select class="input" [(ngModel)]="categorySlug" name="categorySlug" (ngModelChange)="refreshCount()">
          <option value="">Select…</option>
          @for (c of categories(); track c._id) { <option [value]="c.slug">{{ c.name }}</option> }
        </select>
      }

      @if (segmentType === 'store_favouriters') {
        <label class="label">Store</label>
        <select class="input" [(ngModel)]="storeId" name="storeId" (ngModelChange)="refreshCount()">
          <option value="">Select…</option>
          @for (s of stores(); track s._id) { <option [value]="s._id">{{ s.name }} ({{ s.vendorType }})</option> }
        </select>
      }

      <p class="count">
        @if (countLoading()) { Counting audience… }
        @else if (audienceCount() !== null) { 🎯 {{ audienceCount() }} customer(s) will be targeted }
      </p>

      <h3>2. Message</h3>
      <label class="label">Title</label>
      <input class="input" [(ngModel)]="title" name="title" />

      <label class="label">Message (leave blank for an auto-generated one)</label>
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
          <div class="warn">WhatsApp isn't configured yet (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) — messages will be skipped.</div>
        }
        <div class="warn">Only customers who've opted in to WhatsApp updates (Account → WhatsApp updates & offers) will actually receive this — everyone else on this list gets push only.</div>
        <label class="label">Template (must be approved)</label>
        <select class="input" [(ngModel)]="templateName" name="template">
          <option value="">Select…</option>
          @for (t of approvedTemplates(); track t._id) { <option [value]="t.name">{{ t.name }}</option> }
        </select>
        @if (!approvedTemplates().length) { <p class="muted small">No approved templates yet — see WhatsApp Templates.</p> }
      }

      @if (result()) { <div class="ok">{{ result() }}</div> }
      <button class="btn btn-primary" [disabled]="sending() || (!viaPush && !viaWhatsapp) || !segmentReady()">
        {{ sending() ? 'Sending…' : '📣 Send campaign' }}
      </button>
    </form>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .card { max-width: 560px; }
      .label { margin-top: 10px; display: block; } .small { font-size: 0.8rem; }
      .btn-primary { margin-top: 16px; }
      .count { margin-top: 10px; font-weight: 600; font-size: 0.88rem; }
      .ok { background: var(--success-bg, #e7f8ee); color: var(--success, #15803d); padding: 10px; border-radius: 8px; margin-top: 10px; font-weight: 600; }
      .warn { background: #fff7e6; color: #92610a; padding: 8px 10px; border-radius: 8px; font-size: 0.82rem; margin-top: 8px; }
      .checks { display: flex; gap: 16px; margin-top: 6px; font-size: 0.88rem; }
      .checks label { display: flex; align-items: center; gap: 6px; }
    `,
  ],
})
export class CampaignsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  coupons = signal<Coupon[]>([]);
  templates = signal<WaTemplate[]>([]);
  categories = signal<Category[]>([]);
  stores = signal<Store[]>([]);
  waConfigured = signal(false);
  sending = signal(false);
  countLoading = signal(false);
  audienceCount = signal<number | null>(null);
  result = signal<string | null>(null);

  vendorTypes = VENDOR_TYPES;
  segmentType: SegmentType = 'all_customers';
  vendorType: string = VENDOR_TYPES[0];
  categorySlug = '';
  storeId = '';

  title = '📢 New at Marketplace';
  body = '';
  couponCode = '';
  image = '';
  viaPush = true;
  viaWhatsapp = false;
  templateName = '';

  approvedTemplates = computed(() => this.templates().filter((t) => t.status === 'approved'));
  vendorTypeLabel = computed(() => this.vendorType);

  segmentReady(): boolean {
    if (this.segmentType === 'wishlist_category') return !!this.categorySlug;
    if (this.segmentType === 'store_favouriters') return !!this.storeId;
    return true;
  }

  ngOnInit(): void {
    this.api.get<Coupon[]>('/coupons').subscribe((c) => this.coupons.set(c.filter((x) => x.active)));
    this.api.get<WaTemplate[]>('/whatsapp/templates').subscribe((t) => this.templates.set(t));
    this.api.get<{ configured: boolean }>('/whatsapp/configured').subscribe((r) => this.waConfigured.set(r.configured));
    this.api.get<Category[]>('/categories').subscribe((c) => this.categories.set(c));
    this.api.get<Store[]>('/stores').subscribe((s) => this.stores.set(s));
    this.refreshCount();
  }

  onSegmentChange(): void {
    this.audienceCount.set(null);
    if (this.segmentReady()) this.refreshCount();
  }

  private buildSegment(): Record<string, unknown> {
    switch (this.segmentType) {
      case 'favourited_vendor_type':
        return { type: 'favourited_vendor_type', vendorType: this.vendorType };
      case 'wishlist_category':
        return { type: 'wishlist_category', categorySlug: this.categorySlug };
      case 'store_favouriters':
        return { type: 'store_favouriters', storeId: this.storeId };
      default:
        return { type: this.segmentType };
    }
  }

  refreshCount(): void {
    if (!this.segmentReady()) { this.audienceCount.set(null); return; }
    this.countLoading.set(true);
    this.api.post<{ count: number }>('/campaigns/audience-count', { segment: this.buildSegment() }).subscribe({
      next: (r) => { this.countLoading.set(false); this.audienceCount.set(r.count); },
      error: () => { this.countLoading.set(false); this.audienceCount.set(null); },
    });
  }

  send(): void {
    if (!this.segmentReady()) return;
    this.sending.set(true);
    this.result.set(null);
    const channels = [...(this.viaPush ? ['push'] : []), ...(this.viaWhatsapp ? ['whatsapp'] : [])];
    this.api
      .post<{ targeted: number; pushSent: number; whatsappSent: number }>('/campaigns/send', {
        segment: this.buildSegment(),
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
          this.notify.push('Campaign sent', `${r.targeted} customer(s)`, 'success');
        },
        error: (e) => { this.sending.set(false); this.notify.push('Send failed', e?.message, 'warning'); },
      });
  }
}
