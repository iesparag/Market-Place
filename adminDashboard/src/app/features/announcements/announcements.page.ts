import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { EntityPickerComponent, type PickedEntity } from '../../shared/components/entity-picker.component';

type Attach = 'none' | 'product' | 'vendor';
type Audience = 'customers' | 'all' | 'individual';

/** Compose a push (bell + live socket + FCM) and send it to an audience, individual
 * customers, or attach a product/vendor so tapping it opens that exact page. */
@Component({
  selector: 'app-announcements',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, EntityPickerComponent],
  template: `
    <header class="head">
      <div><h1>Push / Announcements</h1><p class="muted">Send a notification to your customers</p></div>
    </header>

    <div class="cols">
      <form class="card" [formGroup]="form" (ngSubmit)="send()">
        <label class="label">Audience</label>
        <select class="input" formControlName="audience" (change)="onAudienceChange()">
          <option value="customers">All customers</option>
          <option value="all">Everyone (customers + vendors)</option>
          <option value="individual">Specific customer(s)</option>
        </select>
        @if (audience() === 'individual') {
          <app-entity-picker
            endpoint="/users" placeholder="Search by name, email or phone…" [multiple]="true"
            [extraParams]="{ role: 'customer' }"
            [mapFn]="userMapFn"
            (changed)="recipients.set($event)" />
        }

        <label class="label">Title *</label>
        <input class="input" formControlName="title" placeholder="🎉 Big weekend sale!" />

        <label class="label">Message</label>
        <textarea class="input" rows="3" formControlName="body" placeholder="Up to 40% off across all stores. Shop now!"></textarea>

        <label class="label">Attach (optional — promotes a specific product or vendor)</label>
        <select class="input" [(ngModel)]="attach" [ngModelOptions]="{ standalone: true }" (change)="onAttachChange()">
          <option value="none">Nothing</option>
          <option value="product">A product</option>
          <option value="vendor">A vendor / store</option>
        </select>
        @if (attach === 'product') {
          <app-entity-picker endpoint="/products" placeholder="Search products…" [mapFn]="productMapFn" (changed)="onPicked($event)" />
        }
        @if (attach === 'vendor') {
          <app-entity-picker endpoint="/stores" placeholder="Search vendors…" [mapFn]="storeMapFn" (changed)="onPicked($event)" />
        }

        <label class="label">Link (where tapping it opens — auto-filled by Attach)</label>
        <input class="input" formControlName="link" placeholder="/catalog?sort=price_asc" />

        <label class="label">Image URL (optional — shown as a hero image in the push)</label>
        <input class="input" formControlName="image" placeholder="https://…" />
        @if (form.controls.image.value) {
          <img class="preview" [src]="form.controls.image.value" alt="" />
        }

        @if (result()) { <div class="ok">{{ result() }}</div> }
        <button class="btn btn-primary" [disabled]="form.invalid || sending() || (audience() === 'individual' && !recipients().length)">
          {{ sending() ? 'Sending…' : '📣 Send notification' }}
        </button>
      </form>

      <div class="card info">
        <h3>How it reaches customers</h3>
        <ul>
          <li>🔔 <b>In-app bell</b> — appears instantly for online users, on next open for others.</li>
          <li>⚡ <b>Live socket</b> — logged-in customers get it in real time.</li>
          <li>📱 <b>Push (mobile app)</b> — real device push once a Firebase key is configured; otherwise logged only.</li>
          <li>🖼️ <b>Image</b> — renders as a big-picture push on Android automatically.</li>
          <li>🔗 <b>Attach a product/vendor</b> — tapping the push opens that exact page in the app.</li>
        </ul>
        <p class="muted small">Preview: <b>{{ form.controls.title.value || 'Title' }}</b> — {{ form.controls.body.value || 'message…' }}</p>
      </div>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; align-items: start; }
      @media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
      .label { margin-top: 10px; display: block; }
      .btn-primary { margin-top: 16px; }
      .ok { background: var(--success-bg, #e7f8ee); color: var(--success, #15803d); padding: 10px; border-radius: 8px; margin-top: 10px; font-weight: 600; }
      .info ul { margin: 8px 0 12px; padding-left: 18px; display: grid; gap: 8px; }
      .info li { font-size: 0.9rem; } .small { font-size: 0.8rem; }
      .preview { margin-top: 8px; max-width: 100%; max-height: 140px; border-radius: 10px; object-fit: cover; }
    `,
  ],
})
export class AnnouncementsPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  sending = signal(false);
  result = signal<string | null>(null);
  audience = signal<Audience>('customers');
  recipients = signal<PickedEntity[]>([]);
  attach: Attach = 'none';

  form = this.fb.nonNullable.group({
    audience: ['customers'],
    title: ['', Validators.required],
    body: [''],
    link: [''],
    image: [''],
  });

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
    this.form.patchValue({ link: '', image: '' });
  }

  onPicked(picked: PickedEntity[]): void {
    const p = picked[0];
    if (!p) return;
    const meta = p.meta as { link?: string; image?: string } | undefined;
    this.form.patchValue({ link: meta?.link ?? this.form.controls.link.value, image: meta?.image || this.form.controls.image.value });
  }

  send(): void {
    if (this.form.invalid) return;
    this.sending.set(true);
    this.result.set(null);
    const v = this.form.getRawValue();

    const req$ = this.audience() === 'individual'
      ? this.api.post<{ recipients: number; devices: number }>('/notifications/send', {
          userIds: this.recipients().map((r) => r.id),
          title: v.title, body: v.body, link: v.link, image: v.image,
        })
      : this.api.post<{ recipients: number; devices: number }>('/notifications/broadcast', v);

    req$.subscribe({
      next: (r) => {
        this.sending.set(false);
        this.result.set(`Sent to ${r.recipients} customer(s) · ${r.devices} device(s) queued for push.`);
        this.notify.push('Announcement sent', `${r.recipients} recipients`, 'success');
        this.form.patchValue({ title: '', body: '', link: '', image: '' });
        this.recipients.set([]);
        this.attach = 'none';
      },
      error: (e) => { this.sending.set(false); this.notify.push('Send failed', e?.message, 'warning'); },
    });
  }
}
