import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

/** Compose a push / announcement and broadcast it to customers (bell + live socket now; FCM once the app ships). */
@Component({
  selector: 'app-announcements',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="head">
      <div><h1>Push / Announcements</h1><p class="muted">Send a notification to your customers</p></div>
    </header>

    <div class="cols">
      <form class="card" [formGroup]="form" (ngSubmit)="send()">
        <label class="label">Audience</label>
        <select class="input" formControlName="audience">
          <option value="customers">All customers</option>
          <option value="all">Everyone (customers + vendors)</option>
        </select>

        <label class="label">Title *</label>
        <input class="input" formControlName="title" placeholder="🎉 Big weekend sale!" />

        <label class="label">Message</label>
        <textarea class="input" rows="3" formControlName="body" placeholder="Up to 40% off across all stores. Shop now!"></textarea>

        <label class="label">Link (optional — where tapping it opens)</label>
        <input class="input" formControlName="link" placeholder="/catalog?sort=price_asc" />

        @if (result()) { <div class="ok">{{ result() }}</div> }
        <button class="btn btn-primary" [disabled]="form.invalid || sending()">
          {{ sending() ? 'Sending…' : '📣 Send notification' }}
        </button>
      </form>

      <div class="card info">
        <h3>How it reaches customers</h3>
        <ul>
          <li>🔔 <b>In-app bell</b> — appears instantly for online users, on next open for others.</li>
          <li>⚡ <b>Live socket</b> — logged-in web customers get it in real time.</li>
          <li>📱 <b>Push (Flutter app)</b> — device tokens are collected now; once FCM keys are added, these go out as real push notifications automatically.</li>
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
      .label { margin-top: 10px; }
      .btn-primary { margin-top: 16px; }
      .ok { background: var(--success-bg, #e7f8ee); color: var(--success, #15803d); padding: 10px; border-radius: 8px; margin-top: 10px; font-weight: 600; }
      .info ul { margin: 8px 0 12px; padding-left: 18px; display: grid; gap: 8px; }
      .info li { font-size: 0.9rem; } .small { font-size: 0.8rem; }
    `,
  ],
})
export class AnnouncementsPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  sending = signal(false);
  result = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    audience: ['customers'],
    title: ['', Validators.required],
    body: [''],
    link: [''],
  });

  send(): void {
    if (this.form.invalid) return;
    this.sending.set(true);
    this.result.set(null);
    this.api.post<{ recipients: number; devices: number }>('/notifications/broadcast', this.form.getRawValue()).subscribe({
      next: (r) => {
        this.sending.set(false);
        this.result.set(`Sent to ${r.recipients} customer(s) · ${r.devices} device(s) queued for push.`);
        this.notify.push('Announcement sent', `${r.recipients} recipients`, 'success');
        this.form.patchValue({ title: '', body: '', link: '' });
      },
      error: (e) => { this.sending.set(false); this.notify.push('Send failed', e?.message, 'warning'); },
    });
  }
}
