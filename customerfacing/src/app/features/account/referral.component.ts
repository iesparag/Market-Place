import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';

interface ReferralInfo {
  code: string;
  rewardPoints: number;
  rewardValuePaise: number;
  referredCount: number;
  rewardedCount: number;
}

@Component({
  selector: 'app-referral',
  standalone: true,
  template: `
    <h1>Invite a friend</h1>
    @if (info(); as i) {
      <div class="card hero">
        <p>Give your friends a reason to shop here — you earn {{ i.rewardPoints }} points (₹{{ i.rewardValuePaise / 100 }}) when their first order is delivered.</p>
        <div class="codebox">
          <span class="code">{{ i.code }}</span>
          <button class="btn btn-sm" (click)="copy(i.code)">{{ copied() ? 'Copied ✓' : 'Copy' }}</button>
        </div>
        <button class="btn btn-primary" (click)="shareLink(i.code)">Share invite link</button>
        <div class="stats">
          <div class="stat"><div class="n">{{ i.referredCount }}</div><div class="muted small">Friends joined</div></div>
          <div class="stat"><div class="n">{{ i.rewardedCount }}</div><div class="muted small">Rewards earned</div></div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .hero { max-width: 460px; margin: 20px auto; padding: 28px 24px; text-align: center; }
      .codebox { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 18px 0; }
      .code { font-family: ui-monospace, monospace; font-size: 1.5rem; font-weight: 800; letter-spacing: 3px;
               background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 18px; }
      .stats { display: flex; gap: 20px; justify-content: center; margin-top: 16px; }
      .n { font-size: 1.6rem; font-weight: 800; }
      .small { font-size: 0.8rem; }
    `,
  ],
})
export class ReferralComponent implements OnInit {
  private readonly api = inject(ApiService);
  info = signal<ReferralInfo | null>(null);
  copied = signal(false);

  ngOnInit(): void {
    this.api.get<ReferralInfo>('/referral/me').subscribe({ next: (i) => this.info.set(i) });
  }

  copy(code: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) void navigator.clipboard.writeText(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  /** Unlike the Flutter app (no deployed web domain for its deep links), this website
   * IS the domain — /register?ref=CODE prefills the referral field for real. */
  shareLink(code: string): void {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/register?ref=${encodeURIComponent(code)}`;
    const text = `Use my referral code ${code} when you sign up — we both get rewarded! ${url}`;
    if (navigator.share) {
      void navigator.share({ title: 'Join the marketplace', text, url }).catch(() => {});
    } else {
      void navigator.clipboard?.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }
}
