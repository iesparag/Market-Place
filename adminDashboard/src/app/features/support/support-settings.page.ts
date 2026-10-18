import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface Macro { label: string; text: string; }
interface SupportConfig {
  botEnabled: boolean;
  channels: { app: boolean; web: boolean };
  greeting: string;
  handoffMessage: string;
  selfService: { trackOrder: boolean; viewInvoice: boolean; cancelUnshipped: boolean; reorder: boolean };
  autoReply: { enabled: boolean; minConfidence: number; businessHoursOnly: boolean };
  slaMinutes: number;
  ratePerMin: number;
  macros: Macro[];
}

/** Master on/off for the whole AI support system — every feature toggles here,
 * nothing needs a rebuild to change. See docs/10-SUPPORT-AI.md. */
@Component({
  selector: 'app-support-settings',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule],
  template: `
    <header class="head"><h1>Support settings</h1><p class="muted">Turn the bot and each self-service feature on or off</p></header>
    <form class="card" [formGroup]="form" (ngSubmit)="save()" style="max-width:520px">
      <label class="check">
        <input type="checkbox" formControlName="botEnabled" />
        <span><b>Bot enabled</b> — master switch; off routes everything straight to a human</span>
      </label>

      <h3 class="section">Channels</h3>
      <label class="check"><input type="checkbox" formControlName="appEnabled" /><span>Flutter app widget</span></label>
      <label class="check"><input type="checkbox" formControlName="webEnabled" /><span>Website widget</span></label>

      <h3 class="section">Messages</h3>
      <label class="label">Greeting</label>
      <textarea class="input" rows="2" formControlName="greeting"></textarea>
      <label class="label">Handoff message (shown when escalated to a human)</label>
      <textarea class="input" rows="2" formControlName="handoffMessage"></textarea>

      <h3 class="section">Self-service capabilities</h3>
      <label class="check"><input type="checkbox" formControlName="trackOrder" /><span>Track order</span></label>
      <label class="check"><input type="checkbox" formControlName="viewInvoice" /><span>View invoice</span></label>
      <label class="check"><input type="checkbox" formControlName="cancelUnshipped" /><span>Cancel unshipped order</span></label>
      <label class="check"><input type="checkbox" formControlName="reorder" /><span>Reorder</span></label>

      <h3 class="section">Auto-reply (experimental)</h3>
      <label class="check"><input type="checkbox" formControlName="autoReplyEnabled" /><span>Auto-send high-confidence AI replies without a human reviewing first</span></label>
      <label class="label">Minimum confidence to auto-send (0–1)</label>
      <input class="input" type="number" step="0.05" min="0" max="1" formControlName="minConfidence" />
      <label class="check"><input type="checkbox" formControlName="businessHoursOnly" /><span>Only during business hours</span></label>

      <h3 class="section">Limits</h3>
      <label class="label">Ticket SLA (minutes before it's considered overdue)</label>
      <input class="input" type="number" formControlName="slaMinutes" />
      <label class="label">Rate limit — bot messages per customer per minute</label>
      <input class="input" type="number" formControlName="ratePerMin" />

      <h3 class="section">Canned responses</h3>
      <p class="hint">Quick-insert templates agents can drop into a reply from the Support Inbox.</p>
      @for (m of macros(); track $index; let i = $index) {
        <div class="macro">
          <input class="input mlabel" [(ngModel)]="m.label" [ngModelOptions]="{standalone:true}" placeholder="Label (e.g. Shipping ETA)" />
          <textarea class="input" rows="2" [(ngModel)]="m.text" [ngModelOptions]="{standalone:true}" placeholder="Reply text…"></textarea>
          <button type="button" class="btn btn-ghost btn-sm" (click)="removeMacro(i)">Remove</button>
        </div>
      }
      <button type="button" class="btn btn-ghost btn-sm" (click)="addMacro()">+ Add canned response</button>

      <button class="btn btn-primary" [disabled]="form.invalid || saving()">{{ saving() ? 'Saving…' : 'Save settings' }}</button>
    </form>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .label { margin-top: 10px; }
      .section { margin: 24px 0 4px; padding-top: 18px; border-top: 1px solid var(--border); }
      .check { display: flex; align-items: flex-start; gap: 8px; margin-top: 10px; cursor: pointer; }
      .check input { width: auto; margin-top: 3px; }
      .btn-primary { margin-top: 20px; }
      .macro { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px; margin-top: 10px; display: grid; gap: 6px; }
      .mlabel { font-weight: 600; }
    `,
  ],
})
export class SupportSettingsPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  saving = signal(false);
  macros = signal<Macro[]>([]);

  addMacro(): void {
    this.macros.update((m) => [...m, { label: '', text: '' }]);
  }
  removeMacro(i: number): void {
    this.macros.update((m) => m.filter((_, idx) => idx !== i));
  }

  form = this.fb.nonNullable.group({
    botEnabled: [true],
    appEnabled: [true],
    webEnabled: [true],
    greeting: ['', Validators.maxLength(500)],
    handoffMessage: ['', Validators.maxLength(500)],
    trackOrder: [true],
    viewInvoice: [true],
    cancelUnshipped: [true],
    reorder: [true],
    autoReplyEnabled: [false],
    minConfidence: [0.85, [Validators.min(0), Validators.max(1)]],
    businessHoursOnly: [false],
    slaMinutes: [120, [Validators.required, Validators.min(1)]],
    ratePerMin: [20, [Validators.required, Validators.min(1)]],
  });

  ngOnInit(): void {
    this.api.get<SupportConfig>('/support/config').subscribe({
      next: (c) => {
        this.form.patchValue({
          botEnabled: c.botEnabled,
          appEnabled: c.channels?.app !== false,
          webEnabled: c.channels?.web !== false,
          greeting: c.greeting,
          handoffMessage: c.handoffMessage,
          trackOrder: c.selfService?.trackOrder !== false,
          viewInvoice: c.selfService?.viewInvoice !== false,
          cancelUnshipped: c.selfService?.cancelUnshipped !== false,
          reorder: c.selfService?.reorder !== false,
          autoReplyEnabled: c.autoReply?.enabled === true,
          minConfidence: c.autoReply?.minConfidence ?? 0.85,
          businessHoursOnly: c.autoReply?.businessHoursOnly === true,
          slaMinutes: c.slaMinutes ?? 120,
          ratePerMin: c.ratePerMin ?? 20,
        });
        this.macros.set(c.macros ?? []);
      },
      error: (e) => this.notify.push('Could not load support settings', e?.message, 'warning'),
    });
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    const body = {
      botEnabled: v.botEnabled,
      channels: { app: v.appEnabled, web: v.webEnabled },
      greeting: v.greeting,
      handoffMessage: v.handoffMessage,
      selfService: {
        trackOrder: v.trackOrder,
        viewInvoice: v.viewInvoice,
        cancelUnshipped: v.cancelUnshipped,
        reorder: v.reorder,
      },
      autoReply: {
        enabled: v.autoReplyEnabled,
        minConfidence: v.minConfidence,
        businessHoursOnly: v.businessHoursOnly,
      },
      slaMinutes: v.slaMinutes,
      ratePerMin: v.ratePerMin,
      macros: this.macros().filter((m) => m.label.trim() && m.text.trim()),
    };
    this.api.put('/support/config', body).subscribe({
      next: () => { this.saving.set(false); this.notify.push('Support settings saved', undefined, 'success'); },
      error: (e) => { this.saving.set(false); this.notify.push('Save failed', e?.message, 'warning'); },
    });
  }
}
