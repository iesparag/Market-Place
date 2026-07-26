import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface AppConfigDoc {
  minVersion?: string;
  latestVersion?: string;
  updateUrl?: string;
  updateMessage?: string;
  adTitle?: string;
  adSubtitle?: string;
  theme?: {
    primary?: string;
    primaryDark?: string;
    soft?: string;
    gradientStart?: string;
    gradientEnd?: string;
    canvas?: string;
  };
}

/** Super-admin controls the mobile app's theme + version gate. The app reads
 *  GET /app/config on launch, so saved changes appear on the next app open. */
@Component({
  selector: 'app-appearance',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="head">
      <h1>App appearance</h1>
      <p class="muted">Theme &amp; force-update for the customer mobile app. Applied on next app launch.</p>
    </header>

    <div class="grid">
      <form class="card" [formGroup]="form" (ngSubmit)="save()">
        <h3>Brand colour</h3>
        <p class="muted sm">Set the primary colour — the rest is auto-derived. Override the others only if you want to.</p>

        <div class="row">
          <label class="label">Primary</label>
          <div class="pick">
            <input type="color" formControlName="primary" />
            <input class="input hex" formControlName="primary" placeholder="#0B8A45" />
          </div>
        </div>

        <details class="adv">
          <summary>Advanced (optional)</summary>
          @for (f of advanced; track f.key) {
            <div class="row">
              <label class="label">{{ f.label }}</label>
              <div class="pick">
                <input type="color" [formControlName]="f.key" />
                <input class="input hex" [formControlName]="f.key" placeholder="auto" />
              </div>
            </div>
          }
        </details>

        <h3 class="mt">Launch banner</h3>
        <label class="label">Title</label>
        <input class="input" formControlName="adTitle" />
        <label class="label">Subtitle</label>
        <input class="input" formControlName="adSubtitle" />

        <h3 class="mt">Version gate (force update)</h3>
        <div class="two">
          <div>
            <label class="label">Min version</label>
            <input class="input" formControlName="minVersion" placeholder="1.0.0" />
          </div>
          <div>
            <label class="label">Latest version</label>
            <input class="input" formControlName="latestVersion" placeholder="1.0.0" />
          </div>
        </div>
        <label class="label">Update URL (Play Store / APK)</label>
        <input class="input" formControlName="updateUrl" placeholder="https://…" />
        <label class="label">Update message</label>
        <input class="input" formControlName="updateMessage" />

        <button class="btn btn-primary mt" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save & publish' }}</button>
      </form>

      <!-- Live preview -->
      <div class="card preview" [style.background]="canvas()">
        <div class="pv-head" [style.background]="primary()">
          <span class="pv-brand">🛍️ Marketplace</span>
        </div>
        <div class="pv-body">
          <button class="pv-btn" [style.background]="primary()">Proceed to checkout</button>
          <div class="pv-add" [style.background]="soft()" [style.color]="primaryDark()" [style.borderColor]="primary()">ADD</div>
          <div class="pv-chip" [style.background]="soft()" [style.color]="primaryDark()">⭐ 4.5</div>
          <div class="pv-bar" [style.background]="'linear-gradient(135deg,' + gStart() + ',' + gEnd() + ')'"></div>
          <span class="pv-link" [style.color]="primaryDark()">View all ›</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .head { margin-bottom: 18px; }
    .grid { display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 18px; align-items: start; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    h3 { margin: 4px 0 2px; font-size: 14px; }
    .mt { margin-top: 18px; }
    .muted.sm { font-size: 12px; margin: 0 0 8px; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; }
    .pick { display: flex; align-items: center; gap: 8px; }
    .pick input[type=color] { width: 38px; height: 34px; border: 1px solid var(--border, #e5e7eb); border-radius: 8px; background: none; padding: 2px; cursor: pointer; }
    .hex { width: 108px; text-transform: lowercase; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .adv { margin-top: 10px; }
    .adv summary { cursor: pointer; font-size: 13px; color: var(--muted, #6b7280); }
    .preview { position: sticky; top: 16px; padding: 0; overflow: hidden; }
    .pv-head { padding: 16px; color: #fff; }
    .pv-brand { font-weight: 800; }
    .pv-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    .pv-btn { border: none; color: #fff; padding: 12px 16px; border-radius: 12px; font-weight: 800; width: 100%; }
    .pv-add { border: 1px solid; padding: 6px 18px; border-radius: 9px; font-weight: 800; font-size: 13px; }
    .pv-chip { padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 12px; }
    .pv-bar { height: 10px; width: 70%; border-radius: 5px; }
    .pv-link { font-weight: 800; font-size: 13px; }
  `],
})
export class AppearancePage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  saving = signal(false);

  readonly advanced = [
    { key: 'primaryDark', label: 'Primary (dark)' },
    { key: 'soft', label: 'Soft surface' },
    { key: 'gradientStart', label: 'Gradient start' },
    { key: 'gradientEnd', label: 'Gradient end' },
    { key: 'canvas', label: 'Page background' },
  ] as const;

  form = this.fb.nonNullable.group({
    primary: '#0B8A45',
    primaryDark: '#076B34',
    soft: '#E7F6EC',
    gradientStart: '#17A55A',
    gradientEnd: '#0B7A43',
    canvas: '#F3F6F4',
    adTitle: '',
    adSubtitle: '',
    minVersion: '',
    latestVersion: '',
    updateUrl: '',
    updateMessage: '',
  });

  // Live-preview signals (fall back to defaults when a field is blank).
  private v = signal(this.form.getRawValue());
  primary = computed(() => this.v().primary || '#0B8A45');
  primaryDark = computed(() => this.v().primaryDark || '#076B34');
  soft = computed(() => this.v().soft || '#E7F6EC');
  gStart = computed(() => this.v().gradientStart || '#17A55A');
  gEnd = computed(() => this.v().gradientEnd || '#0B7A43');
  canvas = computed(() => this.v().canvas || '#F3F6F4');

  ngOnInit(): void {
    this.form.valueChanges.subscribe(() => this.v.set(this.form.getRawValue()));
    this.api.get<AppConfigDoc>('/app/config/admin').subscribe({
      next: (c) => {
        const t = c.theme ?? {};
        this.form.patchValue({
          primary: t.primary || '#0B8A45',
          primaryDark: t.primaryDark || '#076B34',
          soft: t.soft || '#E7F6EC',
          gradientStart: t.gradientStart || '#17A55A',
          gradientEnd: t.gradientEnd || '#0B7A43',
          canvas: t.canvas || '#F3F6F4',
          adTitle: c.adTitle ?? '',
          adSubtitle: c.adSubtitle ?? '',
          minVersion: c.minVersion ?? '',
          latestVersion: c.latestVersion ?? '',
          updateUrl: c.updateUrl ?? '',
          updateMessage: c.updateMessage ?? '',
        });
      },
    });
  }

  save(): void {
    this.saving.set(true);
    const v = this.form.getRawValue();
    const body = {
      minVersion: v.minVersion,
      latestVersion: v.latestVersion,
      updateUrl: v.updateUrl,
      updateMessage: v.updateMessage,
      adTitle: v.adTitle,
      adSubtitle: v.adSubtitle,
      theme: {
        primary: v.primary,
        primaryDark: v.primaryDark,
        soft: v.soft,
        gradientStart: v.gradientStart,
        gradientEnd: v.gradientEnd,
        canvas: v.canvas,
      },
    };
    this.api.patch('/app/config/admin', body).subscribe({
      next: () => { this.notify.push('Appearance saved', 'App will update on next launch', 'success'); this.saving.set(false); },
      error: (e) => { this.notify.push('Failed to save', e?.message, 'warning'); this.saving.set(false); },
    });
  }
}
