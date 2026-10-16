import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { EntityPickerComponent, type PickedEntity } from '../../shared/components/entity-picker.component';

type Attach = 'none' | 'product' | 'vendor';
type Audience = 'customers' | 'vendors' | 'all' | 'individual';

interface CampaignHistoryItem {
  _id: string;
  title: string;
  subtitle?: string;
  body?: string;
  image?: string;
  link?: string;
  actionText?: string;
  audience: string;
  targetCity?: string;
  recipientsCount: number;
  devicesCount: number;
  createdAt: string;
}

@Component({
  selector: 'app-announcements',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, EntityPickerComponent, DatePipe],
  template: `
    <header class="head">
      <div>
        <h1>Push Notifications & Announcements</h1>
        <p class="muted">Send rich, high-converting notifications with images, deal badges, and direct action buttons (like Meesho & Myntra).</p>
      </div>
    </header>

    <div class="cols">
      <!-- Left Column: Notification Composer & Controls -->
      <form class="card composer-card" [formGroup]="form" (ngSubmit)="send()">
        <div class="section-title">1. Audience & Target</div>
        <label class="label">Audience *</label>
        <select class="input" formControlName="audience" (change)="onAudienceChange()">
          <option value="customers">👥 All Customers</option>
          <option value="vendors">🏪 All Vendors & Store Staff</option>
          <option value="all">🌐 Everyone (Customers + Vendors)</option>
          <option value="individual">🎯 Specific Customer(s)</option>
        </select>

        @if (audience() === 'individual') {
          <app-entity-picker
            endpoint="/users" placeholder="Search by name, email or phone…" [multiple]="true"
            [extraParams]="{ role: 'customer' }"
            [mapFn]="userMapFn"
            (changed)="recipients.set($event)" />
        }

        <div class="section-title" style="margin-top: 18px;">2. Notification Content</div>
        
        <!-- Emoji Quick-Insert Bar -->
        <div class="emoji-bar">
          <span class="emoji-hint">Insert Emoji:</span>
          @for (e of quickEmojis; track e) {
            <button type="button" class="emoji-btn" (click)="insertEmoji(e)">{{ e }}</button>
          }
        </div>

        <label class="label">Title *</label>
        <input class="input" formControlName="title" placeholder="📦 Shop Again... or 🎉 Mega Blockbuster Sale!" />

        <label class="label">
          Deal Badge / Subtitle 
          <span class="muted small">(e.g. price highlight, discount or tag shown prominently)</span>
        </label>
        <div class="quick-chips">
          @for (sub of quickSubtitles; track sub) {
            <button type="button" class="chip-btn" (click)="setSubtitle(sub)">{{ sub }}</button>
          }
        </div>
        <input class="input" formControlName="subtitle" placeholder="e.g. At Rs. 124! or ₹598 💰 or UP TO 80% OFF" />

        <label class="label">Message Body</label>
        <textarea class="input" rows="3" formControlName="body" placeholder="Special offer picked just for you. Tap to explore instant deals!"></textarea>

        <div class="section-title" style="margin-top: 18px;">3. Action & Deep Linking</div>
        
        <label class="label">Action Button Text</label>
        <div class="quick-chips">
          @for (act of quickActions; track act) {
            <button type="button" class="chip-btn" (click)="setAction(act)">{{ act }}</button>
          }
        </div>
        <input class="input" formControlName="actionText" placeholder="SHOP or VIEW DEAL or BUY NOW" />

        <label class="label">Attach Store or Product (Auto-fills link & image)</label>
        <select class="input" [(ngModel)]="attach" [ngModelOptions]="{ standalone: true }" (change)="onAttachChange()">
          <option value="none">None (Custom Link)</option>
          <option value="product">Promote a Product</option>
          <option value="vendor">Promote a Store / Vendor</option>
        </select>
        @if (attach === 'product') {
          <app-entity-picker endpoint="/products" placeholder="Search products…" [mapFn]="productMapFn" (changed)="onPicked($event)" />
        }
        @if (attach === 'vendor') {
          <app-entity-picker endpoint="/stores" placeholder="Search vendors…" [mapFn]="storeMapFn" (changed)="onPicked($event)" />
        }

        <label class="label">Deep Link URL / Route</label>
        <div class="quick-chips">
          <button type="button" class="chip-btn" (click)="setLink('/now')">⚡ /now (Quick Commerce)</button>
          <button type="button" class="chip-btn" (click)="setLink('/catalog')">🛍️ /catalog</button>
          <button type="button" class="chip-btn" (click)="setLink('/cart')">🛒 /cart</button>
        </div>
        <input class="input" formControlName="link" placeholder="/now or /catalog or /p/slug" />

        <div class="section-title" style="margin-top: 18px;">4. Banner Image (Big Picture Push)</div>
        <label class="label">Banner Presets (1-Click to apply high-res banner)</label>
        <div class="banner-presets">
          @for (banner of presetBanners; track banner.label) {
            <button type="button" class="banner-pill" (click)="setBanner(banner.url)">
              {{ banner.label }}
            </button>
          }
        </div>
        <input class="input" formControlName="image" placeholder="https://images.unsplash.com/... or paste image URL" />

        @if (result()) { <div class="ok">{{ result() }}</div> }
        @if (testResult()) { <div class="test-ok">{{ testResult() }}</div> }

        <div class="btn-group">
          <button
            type="button"
            class="btn btn-secondary"
            [disabled]="testing() || form.controls.title.invalid"
            (click)="sendTest()">
            {{ testing() ? 'Sending Test…' : '⚡ Send Test Push to Me' }}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            [disabled]="form.invalid || sending() || (audience() === 'individual' && !recipients().length)">
            {{ sending() ? 'Broadcasting…' : '📣 Broadcast Push Notification' }}
          </button>
        </div>
      </form>

      <!-- Right Column: Live Android Notification Shade Preview (Meesho/Myntra style) -->
      <div class="preview-column">
        <div class="card preview-card">
          <div class="preview-header">
            <h3>📱 Android Notification Shade Preview</h3>
            <span class="preview-badge">Live Mockup</span>
          </div>
          <p class="preview-desc muted small">
            This represents how your notification appears on customer lock screens and notification shade (expanded state).
          </p>

          <!-- Android Mockup Shade -->
          <div class="android-shade">
            <div class="notif-card">
              <!-- App Header Bar -->
              <div class="notif-head">
                <div class="notif-app-icon">🛍️</div>
                <span class="notif-app-name">Marketplace</span>
                <span class="notif-dot">•</span>
                <span class="notif-subtext">{{ form.controls.subtitle.value ? 'For you' : 'Just now' }}</span>
                <span class="notif-time">8:28 pm</span>
                <span class="notif-expand">▾</span>
              </div>

              <!-- Main Notification Body -->
              <div class="notif-body-row">
                <div class="notif-text-content">
                  <div class="notif-title">{{ form.controls.title.value || '🎉 Mega Blockbuster Sale!' }}</div>
                  @if (form.controls.subtitle.value) {
                    <div class="notif-deal-badge">{{ form.controls.subtitle.value }}</div>
                  }
                  <div class="notif-message">
                    {{ form.controls.body.value || 'Up to 80% OFF across top stores. Shop now for instant delivery!' }}
                  </div>
                </div>

                @if (form.controls.image.value) {
                  <img class="notif-thumb" [src]="form.controls.image.value" alt="Banner" />
                }
              </div>

              <!-- Hero Big Picture Banner -->
              @if (form.controls.image.value) {
                <div class="notif-hero-container">
                  <img class="notif-hero-img" [src]="form.controls.image.value" alt="Hero Banner" />
                </div>
              }

              <!-- Action Bar Button (Meesho/Myntra style) -->
              <div class="notif-action-row">
                <button type="button" class="notif-action-btn">
                  {{ form.controls.actionText.value || 'SHOP' }}
                </button>
                <span class="notif-action-link muted small">Opens: {{ form.controls.link.value || '/' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Notification Capabilities Card -->
        <div class="card info-card" style="margin-top: 20px;">
          <h3>✨ Supported Features</h3>
          <ul class="info-list">
            <li><b>⚡ 10-Min Now & Scheduled</b> — Deep-link directly to <code>/now</code> for quick-commerce conversion.</li>
            <li><b>🏷️ Deal & Price Badges</b> — Highlights discounted prices (e.g. <code>₹598 💰</code>) right in the notification shade.</li>
            <li><b>🖼️ Big Picture Style</b> — High-resolution images expand automatically on Android devices.</li>
            <li><b>🎯 Smart Deep-Linking</b> — Tap the action button to immediately open products, stores, or checkout.</li>
            <li><b>🔔 Triple-Dispatch</b> — Dispatches via Firebase Cloud Messaging (FCM) + In-App Bell + WebSocket.</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Past Campaigns Table -->
    <div class="card history-card" style="margin-top: 24px;">
      <div class="history-head">
        <h2>📜 Past Push Broadcast Campaigns</h2>
        <button class="btn btn-secondary btn-sm" (click)="loadCampaigns()">🔄 Refresh</button>
      </div>

      @if (loadingHistory()) {
        <p class="muted">Loading campaign history…</p>
      } @else if (campaigns().length === 0) {
        <p class="muted">No broadcast campaigns sent yet. Send your first campaign above!</p>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Title & Subtitle</th>
                <th>Audience</th>
                <th>Recipients</th>
                <th>Devices</th>
                <th>Action Text</th>
                <th>Link</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              @for (c of campaigns(); track c._id) {
                <tr>
                  <td>{{ c.createdAt | date:'short' }}</td>
                  <td>
                    <b>{{ c.title }}</b>
                    @if (c.subtitle) {
                      <span class="history-chip">{{ c.subtitle }}</span>
                    }
                  </td>
                  <td><span class="badge">{{ c.audience }}</span></td>
                  <td>{{ c.recipientsCount }} users</td>
                  <td>{{ c.devicesCount }} devices</td>
                  <td><code>{{ c.actionText || 'SHOP NOW' }}</code></td>
                  <td><code class="small">{{ c.link || '/' }}</code></td>
                  <td>
                    <button class="btn btn-sm btn-outline" (click)="reuseCampaign(c)">Copy to Form</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 24px; align-items: start; }
      @media (max-width: 992px) { .cols { grid-template-columns: 1fr; } }
      
      .section-title { font-weight: 700; font-size: 0.95rem; color: var(--primary, #ea580c); border-bottom: 1px solid var(--border, #eee); padding-bottom: 4px; margin-bottom: 8px; }
      .label { margin-top: 10px; display: block; font-weight: 600; font-size: 0.88rem; }
      .muted { color: var(--muted, #64748b); }
      .small { font-size: 0.8rem; }

      .emoji-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
      .emoji-hint { font-size: 0.8rem; color: var(--muted, #64748b); }
      .emoji-btn { background: var(--bg-surface, #f8fafc); border: 1px solid var(--border, #e2e8f0); border-radius: 6px; padding: 4px 8px; font-size: 1rem; cursor: pointer; transition: transform 0.1s; }
      .emoji-btn:hover { transform: scale(1.15); background: #f1f5f9; }

      .quick-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; margin-bottom: 6px; }
      .chip-btn { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 0.78rem; font-weight: 600; padding: 3px 8px; cursor: pointer; color: #334155; }
      .chip-btn:hover { background: #e2e8f0; }

      .banner-presets { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; margin-bottom: 6px; }
      .banner-pill { background: #fff7ed; border: 1px solid #fed7aa; color: #ea580c; border-radius: 8px; font-size: 0.78rem; font-weight: 600; padding: 4px 10px; cursor: pointer; }
      .banner-pill:hover { background: #ffedd5; }

      .btn-group { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
      .btn { padding: 9px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; font-size: 0.9rem; }
      .btn-primary { background: #ea580c; color: white; }
      .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-secondary { background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; }
      .btn-sm { padding: 4px 10px; font-size: 0.8rem; border-radius: 6px; }
      .btn-outline { background: transparent; border: 1px solid #ea580c; color: #ea580c; }
      .btn-outline:hover { background: #ea580c; color: white; }

      .ok { background: #e7f8ee; color: #15803d; padding: 10px; border-radius: 8px; margin-top: 12px; font-weight: 600; font-size: 0.9rem; }
      .test-ok { background: #eff6ff; color: #1d4ed8; padding: 10px; border-radius: 8px; margin-top: 12px; font-weight: 600; font-size: 0.9rem; }

      /* Android Notification Shade Preview Styling (Matches Android Shade & Meesho/Myntra from Screenshot) */
      .preview-header { display: flex; justify-content: space-between; align-items: center; }
      .preview-badge { background: #ea580c; color: white; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
      .preview-desc { margin: 6px 0 16px; }

      .android-shade { background: #262729; border-radius: 20px; padding: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
      .notif-card { background: #323337; border-radius: 16px; padding: 12px 14px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      
      .notif-head { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: #9da0a6; margin-bottom: 8px; }
      .notif-app-icon { width: 20px; height: 20px; background: #ea580c; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; }
      .notif-app-name { font-weight: 600; color: #ffffff; }
      .notif-time { margin-left: auto; }
      .notif-expand { font-size: 0.85rem; }

      .notif-body-row { display: flex; gap: 12px; align-items: flex-start; }
      .notif-text-content { flex: 1; }
      .notif-title { font-weight: 700; font-size: 0.92rem; color: #f1f5f9; line-height: 1.3; }
      .notif-deal-badge { display: inline-block; background: #f43f5e; color: #ffffff; font-size: 0.8rem; font-weight: 700; padding: 2px 7px; border-radius: 6px; margin: 4px 0; }
      .notif-message { font-size: 0.82rem; color: #cbd5e1; line-height: 1.35; margin-top: 2px; }
      .notif-thumb { width: 52px; height: 52px; border-radius: 8px; object-fit: cover; }

      .notif-hero-container { margin-top: 10px; border-radius: 10px; overflow: hidden; max-height: 160px; }
      .notif-hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }

      .notif-action-row { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); }
      .notif-action-btn { background: #f43f5e; color: #ffffff; font-weight: 800; font-size: 0.82rem; padding: 6px 18px; border: none; border-radius: 6px; cursor: pointer; letter-spacing: 0.5px; }
      .notif-action-link { color: #94a3b8; font-size: 0.75rem; }

      /* Info List */
      .info-list { padding-left: 18px; margin: 8px 0; display: grid; gap: 8px; font-size: 0.85rem; color: #475569; }
      .info-list code { background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-size: 0.8rem; }

      /* History Table */
      .history-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .table-wrap { overflow-x: auto; }
      .table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .table th, .table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      .history-chip { display: inline-block; background: #ffe4e6; color: #e11d48; font-size: 0.72rem; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 6px; }
      .badge { background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    `,
  ],
})
export class AnnouncementsPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  sending = signal(false);
  testing = signal(false);
  result = signal<string | null>(null);
  testResult = signal<string | null>(null);
  audience = signal<Audience>('customers');
  recipients = signal<PickedEntity[]>([]);
  attach: Attach = 'none';

  loadingHistory = signal(false);
  campaigns = signal<CampaignHistoryItem[]>([]);

  readonly quickEmojis = ['📦', '🎉', '⚡', '🔥', '💰', '🛍️', '⏰', '🏷️', '✨', '🚀'];
  readonly quickSubtitles = ['At Rs. 124!', '₹598 💰', 'Flat 50% OFF', '⚡ 15-Min Delivery', 'Limited Time Deal'];
  readonly quickActions = ['SHOP', 'SHOP NOW', 'ORDER NOW', 'CLAIM DEAL', 'EXPLORE'];

  readonly presetBanners = [
    { label: '🎉 Mega Blockbuster Sale', url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=800&q=80' },
    { label: '⚡ 10-Min Quick Delivery', url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80' },
    { label: '👗 Fashion Fiesta', url: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80' },
    { label: '🥦 Fresh Farm Groceries', url: 'https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=800&q=80' },
  ];

  form = this.fb.nonNullable.group({
    audience: ['customers'],
    title: ['🎉 Mega Blockbuster Sale!', Validators.required],
    subtitle: ['At Rs. 124!'],
    body: ['Up to 80% OFF across all stores. Shop now for instant delivery!'],
    link: ['/now'],
    image: ['https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=800&q=80'],
    actionText: ['SHOP'],
  });

  ngOnInit(): void {
    this.loadCampaigns();
  }

  loadCampaigns(): void {
    this.loadingHistory.set(true);
    this.api.get<CampaignHistoryItem[]>('/notifications/campaigns').subscribe({
      next: (data) => {
        this.campaigns.set(data || []);
        this.loadingHistory.set(false);
      },
      error: () => {
        this.loadingHistory.set(false);
      },
    });
  }

  insertEmoji(emoji: string): void {
    const cur = this.form.controls.title.value;
    this.form.patchValue({ title: cur ? `${cur} ${emoji}` : emoji });
  }

  setSubtitle(sub: string): void {
    this.form.patchValue({ subtitle: sub });
  }

  setAction(act: string): void {
    this.form.patchValue({ actionText: act });
  }

  setLink(link: string): void {
    this.form.patchValue({ link });
  }

  setBanner(url: string): void {
    this.form.patchValue({ image: url });
  }

  userMapFn = (r: { _id: string; name?: string; email?: string; phone?: string }): PickedEntity => ({
    id: r._id,
    label: r.name || r.phone || r.email || 'Customer',
    sublabel: r.email || r.phone,
  });

  productMapFn = (r: { _id: string; name: string; slug: string; images?: string[] }): PickedEntity => ({
    id: r._id,
    label: r.name,
    image: r.images?.[0],
    meta: { link: `/p/${r.slug}`, image: r.images?.[0] },
  });

  storeMapFn = (r: { _id: string; name: string; slug: string; logo?: string }): PickedEntity => ({
    id: r._id,
    label: r.name,
    image: r.logo,
    meta: { link: `/store/${r.slug}`, image: r.logo },
  });

  onAudienceChange(): void {
    this.audience.set(this.form.controls.audience.value as Audience);
    this.recipients.set([]);
  }

  onAttachChange(): void {
    if (this.attach === 'none') {
      this.form.patchValue({ link: '', image: '' });
    }
  }

  onPicked(picked: PickedEntity[]): void {
    const p = picked[0];
    if (!p) return;
    const meta = p.meta as { link?: string; image?: string } | undefined;
    this.form.patchValue({
      link: meta?.link ?? this.form.controls.link.value,
      image: meta?.image || this.form.controls.image.value,
    });
  }

  sendTest(): void {
    this.testing.set(true);
    this.testResult.set(null);
    const v = this.form.getRawValue();

    this.api.post<{ success: boolean; message: string; devices: number }>('/notifications/test', {
      title: v.title,
      subtitle: v.subtitle,
      body: v.body,
      link: v.link,
      image: v.image,
      actionText: v.actionText,
    }).subscribe({
      next: (res) => {
        this.testing.set(false);
        this.testResult.set(res.message || 'Test push dispatched to your device!');
        this.notify.push('Test Push Sent', `Dispatched to ${res.devices} device(s)`, 'success');
      },
      error: (e) => {
        this.testing.set(false);
        this.notify.push('Test Push Failed', e?.message, 'warning');
      },
    });
  }

  send(): void {
    if (this.form.invalid) return;
    this.sending.set(true);
    this.result.set(null);
    const v = this.form.getRawValue();

    const req$ = this.audience() === 'individual'
      ? this.api.post<{ recipients: number; devices: number }>('/notifications/send', {
          userIds: this.recipients().map((r) => r.id),
          title: v.title,
          subtitle: v.subtitle,
          body: v.body,
          link: v.link,
          image: v.image,
          actionText: v.actionText,
        })
      : this.api.post<{ recipients: number; devices: number }>('/notifications/broadcast', v);

    req$.subscribe({
      next: (r) => {
        this.sending.set(false);
        this.result.set(`🎉 Dispatched to ${r.recipients} user(s) · ${r.devices} push device(s) queued.`);
        this.notify.push('Broadcast Complete', `${r.recipients} users reached`, 'success');
        this.loadCampaigns();
      },
      error: (e) => {
        this.sending.set(false);
        this.notify.push('Broadcast Failed', e?.message, 'warning');
      },
    });
  }

  reuseCampaign(c: CampaignHistoryItem): void {
    this.form.patchValue({
      title: c.title,
      subtitle: c.subtitle || '',
      body: c.body || '',
      link: c.link || '/now',
      image: c.image || '',
      actionText: c.actionText || 'SHOP',
    });
    this.notify.push('Campaign Loaded', 'Template copied into form', 'info');
  }
}

