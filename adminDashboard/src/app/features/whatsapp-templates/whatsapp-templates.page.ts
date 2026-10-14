import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface WaTemplate {
  _id: string; name: string; language: string; category: string; bodyText: string;
  variableCount: number; hasImageHeader: boolean; status: string; rejectionReason?: string;
}

/**
 * WhatsApp Business templates — every business-initiated WhatsApp message must use one
 * of these (Meta platform rule, not something this app can route around). Creating one
 * here submits it to Meta for review when WHATSAPP_BUSINESS_ACCOUNT_ID is configured;
 * approval usually lands within minutes to a few hours. Use {{1}}, {{2}}… in the body
 * for placeholders filled per-customer at send time (see Cart Recovery page).
 */
@Component({
  selector: 'app-whatsapp-templates',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="head"><h1>WhatsApp Templates</h1><p class="muted">Dynamic templates for cart-recovery / promo campaigns</p></header>

    @if (!configured()) {
      <div class="warn card">
        WhatsApp isn't connected yet. Set <code>WHATSAPP_ACCESS_TOKEN</code>, <code>WHATSAPP_PHONE_NUMBER_ID</code> and
        <code>WHATSAPP_BUSINESS_ACCOUNT_ID</code> on the backend to submit templates to Meta and send real messages.
        Templates can still be drafted here meanwhile.
      </div>
    }

    <div class="cols">
      <div class="card card--flush list">
        <div class="list-head">
          <h3>Templates</h3>
          <button class="btn btn-ghost btn-sm" (click)="sync()" [disabled]="syncing()">{{ syncing() ? 'Syncing…' : '↻ Sync status' }}</button>
        </div>
        <table class="table">
          <thead><tr><th>Name</th><th>Body</th><th>Vars</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (t of templates(); track t._id) {
              <tr>
                <td><b>{{ t.name }}</b><br /><span class="muted small">{{ t.language }} · {{ t.category }}</span></td>
                <td class="body">{{ t.bodyText }}</td>
                <td>{{ t.variableCount }}</td>
                <td>
                  <span class="badge" [class.badge-success]="t.status === 'approved'" [class.badge-warning]="t.status === 'pending'" [class.badge-danger]="t.status === 'rejected'">{{ t.status }}</span>
                  @if (t.rejectionReason) { <div class="muted small">{{ t.rejectionReason }}</div> }
                </td>
                <td><button class="btn btn-ghost btn-sm" (click)="remove(t)">Delete</button></td>
              </tr>
            } @empty { <tr><td colspan="5" class="pad muted">No templates yet.</td></tr> }
          </tbody>
        </table>
      </div>

      <form class="card" [formGroup]="form" (ngSubmit)="create()">
        <h3>New template</h3>
        <label class="label">Name (a-z 0-9 _ only)</label>
        <input class="input" formControlName="name" placeholder="cart_recovery_offer" />

        <div class="two">
          <div><label class="label">Language</label><input class="input" formControlName="language" /></div>
          <div><label class="label">Category</label>
            <select class="input" formControlName="category"><option value="MARKETING">Marketing</option><option value="UTILITY">Utility</option></select>
          </div>
        </div>

        <label class="label">Body — use {{ '{{1}}' }}, {{ '{{2}}' }}… for placeholders</label>
        <textarea class="input" rows="4" formControlName="bodyText" placeholder="Hi {{1}}, you left {{2}} item(s) in your cart. Use {{3}} for a discount — shop now!"></textarea>

        <label class="checkline"><input type="checkbox" formControlName="hasImageHeader" /> Include an image header</label>

        <button class="btn btn-primary" [disabled]="form.invalid">Create & submit for review</button>
      </form>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .warn { background: #fff7e6; color: #92610a; margin-bottom: 16px; font-size: 0.88rem; }
      .warn code { background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 4px; }
      .cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; }
      @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
      .list-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); }
      .body { max-width: 260px; font-size: 0.85rem; white-space: pre-wrap; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .label { margin-top: 10px; display: block; } .pad { padding: 16px; } .small { font-size: 0.8rem; }
      .checkline { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 0.88rem; }
      .btn-primary { margin-top: 16px; }
      .badge-warning { background: #fff3cd; color: #92610a; } .badge-danger { background: #fde2e1; color: #b42318; }
    `,
  ],
})
export class WhatsAppTemplatesPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  templates = signal<WaTemplate[]>([]);
  configured = signal(false);
  syncing = signal(false);

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]],
    language: ['en_US'],
    category: ['MARKETING'],
    bodyText: ['', Validators.required],
    hasImageHeader: [false],
  });

  ngOnInit(): void {
    this.load();
    this.api.get<{ configured: boolean }>('/whatsapp/configured').subscribe((r) => this.configured.set(r.configured));
  }

  load(): void {
    this.api.get<WaTemplate[]>('/whatsapp/templates').subscribe((t) => this.templates.set(t));
  }

  create(): void {
    if (this.form.invalid) return;
    this.api.post('/whatsapp/templates', this.form.getRawValue()).subscribe({
      next: () => {
        this.notify.push('Template submitted', this.configured() ? 'Sent to Meta for review' : 'Saved as draft', 'success');
        this.form.reset({ language: 'en_US', category: 'MARKETING', hasImageHeader: false });
        this.load();
      },
      error: (e) => this.notify.push('Failed', e?.message, 'warning'),
    });
  }

  sync(): void {
    this.syncing.set(true);
    this.api.post<{ synced: number }>('/whatsapp/templates/sync', {}).subscribe({
      next: (r) => { this.syncing.set(false); this.notify.push('Synced', `${r.synced} template(s) updated`, 'success'); this.load(); },
      error: (e) => { this.syncing.set(false); this.notify.push('Sync failed', e?.message, 'warning'); },
    });
  }

  remove(t: WaTemplate): void {
    this.api.delete(`/whatsapp/templates/${t._id}`).subscribe({ next: () => this.load() });
  }
}
