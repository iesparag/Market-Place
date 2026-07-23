import { Component, Input, inject, signal, PLATFORM_ID, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import type { Banner } from '../core/services/catalog.service';

/** Dynamic, admin-controlled hero carousel. Auto-advances (browser only). */
@Component({
  selector: 'app-banner-carousel',
  standalone: true,
  imports: [],
  template: `
    <div class="carousel">
      <div class="track" [style.transform]="'translateX(-' + index() * 100 + '%)'">
        @for (b of banners; track b._id) {
          <div class="slide" [style.background]="b.imageUrl ? 'center/cover no-repeat url(' + b.imageUrl + ')' : b.bg">
            <div class="overlay">
              <h1>{{ b.title }}</h1>
              @if (b.subtitle) { <p>{{ b.subtitle }}</p> }
              <button class="btn cta" (click)="go(b.link)">{{ b.ctaText }} →</button>
            </div>
          </div>
        }
      </div>

      @if (banners.length > 1) {
        <button class="nav prev" (click)="prev()" aria-label="Previous">‹</button>
        <button class="nav next" (click)="next()" aria-label="Next">›</button>
        <div class="dots">
          @for (b of banners; track b._id; let i = $index) {
            <button class="dot" [class.on]="i === index()" (click)="goTo(i)" aria-label="Go to slide"></button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .carousel { position: relative; border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-lg); }
      .track { display: flex; transition: transform 0.5s ease; }
      .slide { flex: 0 0 100%; height: 300px; display: flex; align-items: center; }
      @media (max-width: 640px) { .slide { height: 220px; } }
      .overlay { padding: 0 clamp(28px, 6vw, 70px); color: #fff; max-width: 620px; text-shadow: 0 2px 10px rgba(0,0,0,0.25); }
      .overlay h1 { font-size: 2.2rem; line-height: 1.1; margin-bottom: 8px; }
      .overlay p { font-size: 1.05rem; opacity: 0.96; margin-bottom: 18px; }
      .cta { background: #fff; color: var(--text); font-weight: 700; }
      .nav { position: absolute; top: 50%; transform: translateY(-50%); width: 42px; height: 42px; border-radius: 50%; border: none; background: rgba(255,255,255,0.85); font-size: 1.6rem; cursor: pointer; display: grid; place-items: center; box-shadow: var(--shadow); }
      .prev { left: 14px; } .next { right: 14px; }
      .dots { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
      .dot { width: 9px; height: 9px; border-radius: 50%; border: none; background: rgba(255,255,255,0.5); cursor: pointer; }
      .dot.on { background: #fff; width: 24px; border-radius: 999px; }
    `,
  ],
})
export class BannerCarouselComponent implements OnDestroy {
  @Input({ required: true }) banners: Banner[] = [];
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  index = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    if (this.browser) this.timer = setInterval(() => this.next(), 5000);
  }
  ngOnDestroy(): void { if (this.timer) clearInterval(this.timer); }

  next(): void { this.index.set((this.index() + 1) % Math.max(this.banners.length, 1)); }
  prev(): void { this.index.set((this.index() - 1 + this.banners.length) % Math.max(this.banners.length, 1)); }
  goTo(i: number): void { this.index.set(i); }
  go(link: string): void { void this.router.navigateByUrl(link); }
}
