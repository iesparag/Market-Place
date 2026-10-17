import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface ThemeTokens {
  primary?: string;
  primaryDark?: string;
  soft?: string;
  gradientStart?: string;
  gradientEnd?: string;
  canvas?: string;
}
interface AppConfigDoc {
  minVersion?: string;
  latestVersion?: string;
  updateUrl?: string;
  updateMessage?: string;
  adTitle?: string;
  adSubtitle?: string;
  theme?: ThemeTokens;
  themeDark?: ThemeTokens;
  themePresetId?: string;
}
interface PalettePreset {
  id: string;
  name: string;
  light: Required<ThemeTokens>;
  dark: Required<ThemeTokens>;
}

const LIGHT_DEFAULTS: Required<ThemeTokens> = {
  primary: '#0B8A45', primaryDark: '#076B34', soft: '#E7F6EC',
  gradientStart: '#17A55A', gradientEnd: '#0B7A43', canvas: '#F3F6F4',
};
const DARK_DEFAULTS: Required<ThemeTokens> = {
  primary: '#17A55A', primaryDark: '#0E6B38', soft: '#17251C',
  gradientStart: '#1CB864', gradientEnd: '#0E7A43', canvas: '#121316',
};

/** Super-admin controls the mobile app's theme (light + dark) + version gate. The app
 *  reads GET /app/config on launch, so saved changes appear on the next app open. */
@Component({
  selector: 'app-appearance',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="head">
      <h1>App appearance</h1>
      <p class="muted">Theme (light &amp; dark) &amp; force-update for the customer mobile app. Applied on next app launch.</p>
    </header>

    <div class="card presets-card">
      <h3>Pick a palette</h3>
      <p class="muted sm">32 ready-made light+dark pairs — click one to apply instantly. Fine-tune manually below if you want.</p>
      <div class="preset-grid">
        @for (p of presets(); track p.id) {
          <button type="button" class="preset-swatch" [class.active]="activePresetId() === p.id" (click)="applyPreset(p)" [disabled]="applying()">
            <span class="swatch-pair">
              <span class="swatch-dot" [style.background]="p.light.primary"></span>
              <span class="swatch-dot dark" [style.background]="p.dark.primary"></span>
            </span>
            <span class="swatch-name">{{ p.name }}</span>
          </button>
        }
      </div>
    </div>

    <div class="grid">
      <form class="card" [formGroup]="form" (ngSubmit)="save()">
        <h3>Manual override</h3>
        <p class="muted sm">Only needed if you want to fine-tune past a preset. Set the primary colour — the rest auto-derives per mode.</p>

        <div class="mode-tabs">
          <button type="button" class="mode-tab" [class.active]="editMode() === 'light'" (click)="editMode.set('light')">☀️ Light</button>
          <button type="button" class="mode-tab" [class.active]="editMode() === 'dark'" (click)="editMode.set('dark')">🌙 Dark</button>
        </div>

        @if (editMode() === 'light') {
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
        } @else {
          <div class="row">
            <label class="label">Primary</label>
            <div class="pick">
              <input type="color" formControlName="primaryD" />
              <input class="input hex" formControlName="primaryD" placeholder="#17A55A" />
            </div>
          </div>
          <details class="adv">
            <summary>Advanced (optional)</summary>
            @for (f of advancedDark; track f.key) {
              <div class="row">
                <label class="label">{{ f.label }}</label>
                <div class="pick">
                  <input type="color" [formControlName]="f.key" />
                  <input class="input hex" [formControlName]="f.key" placeholder="auto" />
                </div>
              </div>
            }
          </details>
        }

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
        <div class="preview-tabs">
          <button type="button" class="ptab" [class.active]="previewMode() === 'light'" (click)="previewMode.set('light')">☀️ Light</button>
          <button type="button" class="ptab" [class.active]="previewMode() === 'dark'" (click)="previewMode.set('dark')">🌙 Dark</button>
        </div>
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
    .presets-card { margin-bottom: 18px; }
    .preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; margin-top: 10px; }
    .preset-swatch { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px; border: 1px solid var(--border, #e5e7eb); border-radius: 10px; background: var(--surface, #fff); cursor: pointer; }
    .preset-swatch:hover { border-color: var(--brand-400, #94a3b8); }
    .preset-swatch.active { border-color: var(--brand-600, #0B8A45); border-width: 2px; background: var(--surface-2, #f8fafc); }
    .preset-swatch:disabled { opacity: 0.6; cursor: wait; }
    .swatch-pair { display: flex; }
    .swatch-dot { width: 20px; height: 20px; border-radius: 50%; display: inline-block; border: 2px solid #fff; box-shadow: 0 0 0 1px var(--border, #e5e7eb); }
    .swatch-dot.dark { margin-left: -8px; }
    .swatch-name { font-size: 11px; font-weight: 600; text-align: center; line-height: 1.2; }
    .grid { display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 18px; align-items: start; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    h3 { margin: 4px 0 2px; font-size: 14px; }
    .mt { margin-top: 18px; }
    .muted.sm { font-size: 12px; margin: 0 0 8px; }
    .mode-tabs, .preview-tabs { display: flex; gap: 6px; margin: 10px 0; }
    .mode-tab, .ptab { flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border, #e5e7eb); background: var(--surface, #fff); cursor: pointer; font-size: 12.5px; font-weight: 700; }
    .mode-tab.active, .ptab.active { background: var(--brand-50, #f0fdf4); border-color: var(--brand-600, #0B8A45); color: var(--brand-700, #076B34); }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; }
    .pick { display: flex; align-items: center; gap: 8px; }
    .pick input[type=color] { width: 38px; height: 34px; border: 1px solid var(--border, #e5e7eb); border-radius: 8px; background: none; padding: 2px; cursor: pointer; }
    .hex { width: 108px; text-transform: lowercase; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .adv { margin-top: 10px; }
    .adv summary { cursor: pointer; font-size: 13px; color: var(--muted, #6b7280); }
    .preview { position: sticky; top: 16px; padding: 0; overflow: hidden; }
    .preview-tabs { padding: 10px 10px 0; margin: 0; }
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
  applying = signal(false);
  presets = signal<PalettePreset[]>([]);
  activePresetId = signal<string>('');
  /** Which palette the manual-override form edits right now. */
  editMode = signal<'light' | 'dark'>('light');
  /** Which palette the live preview panel shows right now — independent of editMode so
   * you can tweak light while eyeballing how dark already looks, or vice versa. */
  previewMode = signal<'light' | 'dark'>('light');

  readonly advanced = [
    { key: 'primaryDark', label: 'Primary (dark)' },
    { key: 'soft', label: 'Soft surface' },
    { key: 'gradientStart', label: 'Gradient start' },
    { key: 'gradientEnd', label: 'Gradient end' },
    { key: 'canvas', label: 'Page background' },
  ] as const;
  readonly advancedDark = [
    { key: 'primaryDarkD', label: 'Primary (dark)' },
    { key: 'softD', label: 'Soft surface' },
    { key: 'gradientStartD', label: 'Gradient start' },
    { key: 'gradientEndD', label: 'Gradient end' },
    { key: 'canvasD', label: 'Page background' },
  ] as const;

  form = this.fb.nonNullable.group({
    primary: LIGHT_DEFAULTS.primary,
    primaryDark: LIGHT_DEFAULTS.primaryDark,
    soft: LIGHT_DEFAULTS.soft,
    gradientStart: LIGHT_DEFAULTS.gradientStart,
    gradientEnd: LIGHT_DEFAULTS.gradientEnd,
    canvas: LIGHT_DEFAULTS.canvas,
    primaryD: DARK_DEFAULTS.primary,
    primaryDarkD: DARK_DEFAULTS.primaryDark,
    softD: DARK_DEFAULTS.soft,
    gradientStartD: DARK_DEFAULTS.gradientStart,
    gradientEndD: DARK_DEFAULTS.gradientEnd,
    canvasD: DARK_DEFAULTS.canvas,
    adTitle: '',
    adSubtitle: '',
    minVersion: '',
    latestVersion: '',
    updateUrl: '',
    updateMessage: '',
  });

  // Live-preview signals (fall back to defaults when a field is blank), switch source
  // palette based on previewMode so the panel can show either mode on demand.
  private v = signal(this.form.getRawValue());
  primary = computed(() => (this.previewMode() === 'light' ? this.v().primary : this.v().primaryD) || LIGHT_DEFAULTS.primary);
  primaryDark = computed(() => (this.previewMode() === 'light' ? this.v().primaryDark : this.v().primaryDarkD) || LIGHT_DEFAULTS.primaryDark);
  soft = computed(() => (this.previewMode() === 'light' ? this.v().soft : this.v().softD) || LIGHT_DEFAULTS.soft);
  gStart = computed(() => (this.previewMode() === 'light' ? this.v().gradientStart : this.v().gradientStartD) || LIGHT_DEFAULTS.gradientStart);
  gEnd = computed(() => (this.previewMode() === 'light' ? this.v().gradientEnd : this.v().gradientEndD) || LIGHT_DEFAULTS.gradientEnd);
  canvas = computed(() => (this.previewMode() === 'light' ? this.v().canvas : this.v().canvasD) || LIGHT_DEFAULTS.canvas);

  ngOnInit(): void {
    this.form.valueChanges.subscribe(() => this.v.set(this.form.getRawValue()));
    this.loadConfig();
    this.api.get<PalettePreset[]>('/app/config/presets').subscribe({ next: (p) => this.presets.set(p) });
  }

  private loadConfig(): void {
    this.api.get<AppConfigDoc>('/app/config/admin').subscribe({
      next: (c) => {
        const t = c.theme ?? {};
        const td = c.themeDark ?? {};
        this.activePresetId.set(c.themePresetId ?? '');
        this.form.patchValue({
          primary: t.primary || LIGHT_DEFAULTS.primary,
          primaryDark: t.primaryDark || LIGHT_DEFAULTS.primaryDark,
          soft: t.soft || LIGHT_DEFAULTS.soft,
          gradientStart: t.gradientStart || LIGHT_DEFAULTS.gradientStart,
          gradientEnd: t.gradientEnd || LIGHT_DEFAULTS.gradientEnd,
          canvas: t.canvas || LIGHT_DEFAULTS.canvas,
          primaryD: td.primary || DARK_DEFAULTS.primary,
          primaryDarkD: td.primaryDark || DARK_DEFAULTS.primaryDark,
          softD: td.soft || DARK_DEFAULTS.soft,
          gradientStartD: td.gradientStart || DARK_DEFAULTS.gradientStart,
          gradientEndD: td.gradientEnd || DARK_DEFAULTS.gradientEnd,
          canvasD: td.canvas || DARK_DEFAULTS.canvas,
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

  /** One click: applies + saves a full light+dark pair immediately (not just staged in
   * the form) — matches "I should just pick one," no separate Save step needed. */
  applyPreset(p: PalettePreset): void {
    this.applying.set(true);
    this.api.post('/app/config/presets/apply', { presetId: p.id }).subscribe({
      next: () => {
        this.activePresetId.set(p.id);
        this.loadConfig();
        this.notify.push('Palette applied', p.name, 'success');
        this.applying.set(false);
      },
      error: (e) => { this.notify.push('Failed to apply', e?.message, 'warning'); this.applying.set(false); },
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
      themeDark: {
        primary: v.primaryD,
        primaryDark: v.primaryDarkD,
        soft: v.softD,
        gradientStart: v.gradientStartD,
        gradientEnd: v.gradientEndD,
        canvas: v.canvasD,
      },
    };
    this.api.patch('/app/config/admin', body).subscribe({
      next: () => { this.notify.push('Appearance saved', 'App will update on next launch', 'success'); this.saving.set(false); },
      error: (e) => { this.notify.push('Failed to save', e?.message, 'warning'); this.saving.set(false); },
    });
  }
}
