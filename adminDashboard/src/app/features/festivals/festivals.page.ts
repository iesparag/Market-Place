import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface Festival {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  greetingTitle: string;
  greetingMessage: string;
  lottieUrl: string;
  bannerImageUrl?: string;
  themeColor?: string;
  priority: number;
  active: boolean;
}

@Component({
  selector: 'app-festivals',
  standalone: true,
  imports: [ReactiveFormsModule, SlicePipe],
  template: `
    <header class="head">
      <h1>Festivals</h1>
      <p class="muted">Diwali, Holi, Eid, Raksha Bandhan… each one shows a one-time greeting + animation in the customer app during its date window. No app release needed.</p>
    </header>

    <div class="cols">
      <div>
        @for (f of festivals(); track f._id) {
          <div class="card fest" [class.off]="!f.active || !isLiveWindow(f)">
            <div class="dates muted small">{{ f.startDate | slice: 0:10 }} → {{ f.endDate | slice: 0:10 }}</div>
            <div class="info">
              <b>{{ f.name }}</b>
              <div class="muted small">{{ f.greetingTitle }}</div>
              @if (isLive(f)) { <span class="badge live">live now</span> }
            </div>
            <div class="muted small priority">priority {{ f.priority }}</div>
            <label class="switch">
              <input type="checkbox" [checked]="f.active" (change)="toggle(f, $event)" /><span class="slider"></span>
            </label>
            <button class="btn btn-ghost btn-sm del" (click)="remove(f)">✕</button>
          </div>
        } @empty { <div class="card muted">No festivals configured yet — add one on the right.</div> }
      </div>

      <form class="card" [formGroup]="form" (ngSubmit)="create()">
        <h3>New festival</h3>
        <label class="label">Name *</label><input class="input" formControlName="name" placeholder="Diwali" />
        @if (form.controls.name.touched && form.controls.name.invalid) { <div class="err">Name is required</div> }

        <div class="row2">
          <div>
            <label class="label">Start date *</label>
            <input class="input" type="date" formControlName="startDate" />
          </div>
          <div>
            <label class="label">End date *</label>
            <input class="input" type="date" formControlName="endDate" />
          </div>
        </div>

        <label class="label">Greeting title *</label>
        <input class="input" formControlName="greetingTitle" placeholder="Happy Diwali! 🪔" />
        @if (form.controls.greetingTitle.touched && form.controls.greetingTitle.invalid) { <div class="err">Greeting title is required</div> }

        <label class="label">Greeting message</label>
        <input class="input" formControlName="greetingMessage" placeholder="Wishing you joy and prosperity — enjoy festive offers inside!" />

        <label class="label">Lottie animation URL *</label>
        <input class="input" formControlName="lottieUrl" placeholder="https://lottie.host/....json" />
        <p class="hint">Free animations: lottiefiles.com — copy the "Lottie JSON" URL.</p>
        @if (form.controls.lottieUrl.touched && form.controls.lottieUrl.invalid) { <div class="err">A valid animation URL is required</div> }

        <label class="label">Banner image URL (optional)</label>
        <input class="input" formControlName="bannerImageUrl" />

        <div class="row2">
          <div>
            <label class="label">Theme color (optional)</label>
            <input class="input color" type="color" formControlName="themeColor" />
          </div>
          <div>
            <label class="label">Priority</label>
            <input class="input" type="number" formControlName="priority" />
          </div>
        </div>
        <p class="hint">If two festivals' windows overlap, the higher priority one shows.</p>

        <button class="btn btn-primary" [disabled]="form.invalid">Add festival</button>
      </form>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; }
      @media (max-width: 820px) { .cols { grid-template-columns: 1fr; } }
      .fest { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
      .fest.off { opacity: 0.55; }
      .dates { width: 150px; flex-shrink: 0; }
      .info { flex: 1; min-width: 160px; } .small { font-size: 0.8rem; }
      .priority { width: 80px; text-align: right; flex-shrink: 0; }
      .badge.live { display: inline-block; margin-top: 4px; padding: 2px 8px; font-size: 0.7rem; font-weight: 700; border-radius: 999px; background: var(--success-bg); color: var(--success); }
      .del:hover { color: var(--danger); }
      .label { margin-top: 10px; } .btn-primary { margin-top: 16px; } .color { height: 42px; padding: 4px; }
      .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .err { color: var(--danger); font-size: 0.82rem; margin-top: 4px; }
      .hint { font-size: 0.78rem; color: var(--text-muted); margin: 4px 0 0; }
      .switch { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; inset: 0; background: var(--border); border-radius: 999px; cursor: pointer; transition: 0.2s; }
      .slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
      .switch input:checked + .slider { background: var(--success); }
      .switch input:checked + .slider::before { transform: translateX(18px); }
    `,
  ],
})
export class FestivalsPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  festivals = signal<Festival[]>([]);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    greetingTitle: ['', Validators.required],
    greetingMessage: [''],
    lottieUrl: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    bannerImageUrl: [''],
    themeColor: ['#ea580c'],
    priority: [0],
  });

  ngOnInit(): void {
    this.load();
  }
  load(): void {
    this.api.get<Festival[]>('/festivals/all').subscribe({ next: (f) => this.festivals.set(f) });
  }

  isLiveWindow(f: Festival): boolean {
    const now = Date.now();
    return new Date(f.startDate).getTime() <= now && new Date(f.endDate).getTime() >= now;
  }
  isLive(f: Festival): boolean {
    return f.active && this.isLiveWindow(f);
  }

  create(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.api
      .post('/festivals', {
        ...v,
        bannerImageUrl: v.bannerImageUrl || undefined,
        themeColor: v.themeColor || undefined,
        priority: Number(v.priority) || 0,
      })
      .subscribe({
        next: () => {
          this.notify.push('Festival added', undefined, 'success');
          this.form.reset({ greetingMessage: '', bannerImageUrl: '', themeColor: '#ea580c', priority: 0 });
          this.load();
        },
        error: (e) => this.notify.push('Failed', e?.message, 'warning'),
      });
  }

  toggle(f: Festival, e: Event): void {
    this.api.patch(`/festivals/${f._id}`, { active: (e.target as HTMLInputElement).checked }).subscribe({ next: () => this.load() });
  }

  remove(f: Festival): void {
    if (!confirm(`Delete "${f.name}"?`)) return;
    this.api.delete(`/festivals/${f._id}`).subscribe({ next: () => this.load() });
  }
}
