import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-loyalty',
  standalone: true,
  template: `
    <h1>Loyalty points</h1>
    <div class="card hero">
      <div class="num">{{ points() }}</div>
      <div class="muted">points · worth ₹{{ valuePaise() / 100 }}</div>
      <p class="muted small">Earn points on every paid order. Redeem them for a discount at checkout.</p>
    </div>
  `,
  styles: [
    `
      .hero { text-align: center; max-width: 360px; margin: 20px auto; padding: 32px 20px; }
      .num { font-size: 2.6rem; font-weight: 800; color: var(--brand-700); }
      .small { font-size: 0.82rem; margin-top: 10px; }
    `,
  ],
})
export class LoyaltyComponent implements OnInit {
  private readonly api = inject(ApiService);
  points = signal(0);
  valuePaise = signal(0);

  ngOnInit(): void {
    this.api.get<{ points: number; valuePaise: number }>('/loyalty/balance').subscribe({
      next: (b) => { this.points.set(b.points); this.valuePaise.set(b.valuePaise); },
    });
  }
}
