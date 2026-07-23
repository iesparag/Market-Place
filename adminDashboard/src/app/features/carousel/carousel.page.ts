import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface Banner {
  _id: string; title: string; subtitle: string; imageUrl?: string; ctaText: string;
  link: string; bg: string; active: boolean; order: number;
}

@Component({
  selector: 'app-carousel',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="head"><h1>Home Carousel</h1><p class="muted">Banners shown on the storefront homepage. Turn one off → it hides and the rest move up.</p></header>

    <div class="cols">
      <div>
        @for (b of banners(); track b._id) {
          <div class="card banner" [class.off]="!b.active" [style.--bg]="b.bg">
            <div class="thumb">@if (b.imageUrl) { <img [src]="b.imageUrl" alt="" /> } @else { <span>{{ b.title.slice(0,1) }}</span> }</div>
            <div class="info">
              <b>{{ b.title }}</b>
              <div class="muted small">{{ b.subtitle }} · → {{ b.link }}</div>
            </div>
            <div class="ord">
              <button class="btn btn-ghost btn-sm" (click)="move(b, -1)" [disabled]="$index === 0">↑</button>
              <button class="btn btn-ghost btn-sm" (click)="move(b, 1)" [disabled]="$index === banners().length - 1">↓</button>
            </div>
            <label class="switch">
              <input type="checkbox" [checked]="b.active" (change)="toggle(b, $event)" /><span class="slider"></span>
            </label>
            <button class="btn btn-ghost btn-sm del" (click)="remove(b)">✕</button>
          </div>
        } @empty { <div class="card muted">No banners yet — add one on the right.</div> }
      </div>

      <form class="card" [formGroup]="form" (ngSubmit)="create()">
        <h3>New banner</h3>
        <label class="label">Image (optional)</label>
        <div class="imgup">
          @if (imageUrl()) { <div class="prev"><img [src]="imageUrl()" alt="" /><button type="button" (click)="imageUrl.set('')">✕</button></div> }
          <label class="upload">{{ uploading() ? '…' : '+ Upload' }}<input type="file" accept="image/*" (change)="onFile($event)" hidden /></label>
        </div>
        <label class="label">Title *</label><input class="input" formControlName="title" />
        @if (form.controls.title.touched && form.controls.title.invalid) { <div class="err">Title is required</div> }
        <label class="label">Subtitle</label><input class="input" formControlName="subtitle" />
        <label class="label">CTA text</label><input class="input" formControlName="ctaText" />
        <label class="label">Link (route)</label><input class="input" formControlName="link" placeholder="/catalog?category=pizza" />
        <label class="label">Background color</label><input class="input color" type="color" formControlName="bg" />
        <button class="btn btn-primary" [disabled]="form.invalid">Add banner</button>
      </form>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; }
      .cols { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; align-items: start; }
      @media (max-width: 820px) { .cols { grid-template-columns: 1fr; } }
      .banner { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
      .banner.off { opacity: 0.55; }
      .thumb { width: 90px; height: 54px; border-radius: 8px; overflow: hidden; background: var(--bg, var(--surface-2)); display: grid; place-items: center; color: #fff; font-weight: 800; flex-shrink: 0; }
      .thumb img { width: 100%; height: 100%; object-fit: cover; }
      .info { flex: 1; min-width: 0; } .small { font-size: 0.8rem; }
      .ord { display: flex; flex-direction: column; gap: 2px; }
      .del:hover { color: var(--danger); }
      .label { margin-top: 10px; } .btn-primary { margin-top: 16px; } .color { height: 42px; padding: 4px; }
      .err { color: var(--danger); font-size: 0.82rem; margin-top: 4px; }
      .imgup { display: flex; gap: 10px; align-items: center; }
      .prev { position: relative; width: 90px; height: 54px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
      .prev img { width: 100%; height: 100%; object-fit: cover; }
      .prev button { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 11px; }
      .upload { width: 90px; height: 54px; border: 1px dashed var(--border); border-radius: 8px; display: grid; place-items: center; cursor: pointer; color: var(--text-muted); font-size: 0.8rem; }
      .switch { position: relative; display: inline-block; width: 40px; height: 22px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; inset: 0; background: var(--border); border-radius: 999px; cursor: pointer; transition: 0.2s; }
      .slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
      .switch input:checked + .slider { background: var(--success); }
      .switch input:checked + .slider::before { transform: translateX(18px); }
    `,
  ],
})
export class CarouselPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);

  banners = signal<Banner[]>([]);
  imageUrl = signal('');
  uploading = signal(false);

  form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    subtitle: [''],
    ctaText: ['Shop now'],
    link: ['/catalog'],
    bg: ['#ea580c'],
  });

  ngOnInit(): void { this.load(); }
  load(): void { this.api.get<Banner[]>('/banners/all').subscribe({ next: (b) => this.banners.set(b) }); }

  onFile(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.api.upload<{ url: string }>('/media/upload', file).subscribe({
      next: (r) => { this.imageUrl.set(r.url); this.uploading.set(false); },
      error: () => this.uploading.set(false),
    });
  }

  create(): void {
    if (this.form.invalid) return;
    this.api.post('/banners', { ...this.form.getRawValue(), imageUrl: this.imageUrl() || undefined }).subscribe({
      next: () => { this.notify.push('Banner added', undefined, 'success'); this.form.reset({ ctaText: 'Shop now', link: '/catalog', bg: '#ea580c' }); this.imageUrl.set(''); this.load(); },
      error: (e) => this.notify.push('Failed', e?.message, 'warning'),
    });
  }

  toggle(b: Banner, e: Event): void {
    this.api.patch(`/banners/${b._id}`, { active: (e.target as HTMLInputElement).checked }).subscribe({ next: () => this.load() });
  }

  move(b: Banner, dir: number): void {
    const list = [...this.banners()];
    const i = list.findIndex((x) => x._id === b._id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    this.banners.set(list);
    this.api.post('/banners/reorder', { ids: list.map((x) => x._id) }).subscribe();
  }

  remove(b: Banner): void {
    if (!confirm('Delete this banner?')) return;
    this.api.delete(`/banners/${b._id}`).subscribe({ next: () => this.load() });
  }
}
