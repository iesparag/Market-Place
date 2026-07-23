import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';

interface Review { _id: string; rating: number; text: string; createdAt: string; verified?: boolean; customerName?: string; }

@Component({
  selector: 'app-reviews',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="card reviews">
      <h3>Reviews @if (reviews().length) { <span class="muted">({{ avg() }}★ · {{ reviews().length }})</span> }</h3>

      @if (!auth.isLoggedIn()) {
        <p class="muted"><a routerLink="/login">Sign in</a> to write a review.</p>
      } @else if (canReview()) {
        <div class="write">
          <div class="stars">
            @for (s of [1,2,3,4,5]; track s) {
              <button type="button" class="star" [class.on]="s <= rating()" (click)="rating.set(s)">★</button>
            }
          </div>
          <textarea class="input" rows="2" [(ngModel)]="text" placeholder="Share your experience…"></textarea>
          @if (error()) { <div class="fe">{{ error() }}</div> }
          <button class="btn btn-primary btn-sm" [disabled]="submitting()" (click)="submit()">{{ mine() ? 'Update review' : 'Post review' }}</button>
        </div>
      } @else {
        <p class="muted onlybuyers">🔒 Only customers who purchased this product can review it.</p>
      }

      @for (r of reviews(); track r._id) {
        <div class="rev">
          <div class="rhead">
            <span class="rstars">{{ stars(r.rating) }}</span>
            <span class="muted name">{{ r.customerName || 'Customer' }}</span>
            @if (r.verified) { <span class="badge badge-success vb">✓ verified purchase</span> }
          </div>
          <div>{{ r.text }}</div>
          <div class="muted small">{{ r.createdAt.slice(0,10) }}</div>
        </div>
      } @empty { <p class="muted">No reviews yet.</p> }
    </div>
  `,
  styles: [
    `
      .reviews { margin-top: 20px; }
      .write { margin: 10px 0 16px; display: grid; gap: 8px; }
      .stars { display: flex; gap: 2px; }
      .star { background: none; border: none; font-size: 1.4rem; color: var(--border); cursor: pointer; padding: 0; }
      .star.on { color: #f5a623; }
      .rstars { color: #f5a623; }
      .rhead { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
      .name { font-size: 0.85rem; } .vb { font-size: 0.7rem; }
      .rev { padding: 10px 0; border-top: 1px solid var(--border); }
      .small { font-size: 0.75rem; margin-top: 2px; }
      .fe { color: var(--danger); font-size: 0.82rem; }
      .onlybuyers { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; margin: 10px 0 16px; font-size: 0.9rem; }
    `,
  ],
})
export class ReviewsComponent implements OnInit {
  @Input() productId = '';
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);

  reviews = signal<Review[]>([]);
  rating = signal(5);
  text = '';
  submitting = signal(false);
  canReview = signal(false);
  mine = signal(false);
  error = signal<string | null>(null);

  ngOnInit(): void { this.load(); this.checkCanReview(); }
  load(): void {
    this.api.get<Review[]>(`/reviews/product/${this.productId}`).subscribe({ next: (r) => this.reviews.set(r) });
  }
  private checkCanReview(): void {
    if (!this.auth.isLoggedIn()) return;
    this.api.get<{ canReview: boolean; mine: { rating: number; text: string } | null }>(`/reviews/can-review/${this.productId}`).subscribe({
      next: (r) => {
        this.canReview.set(r.canReview);
        if (r.mine) { this.mine.set(true); this.rating.set(r.mine.rating); this.text = r.mine.text; }
      },
      error: () => {},
    });
  }

  avg(): string {
    const list = this.reviews();
    return (list.reduce((s, r) => s + r.rating, 0) / list.length).toFixed(1);
  }
  stars(n: number): string {
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  }

  submit(): void {
    this.submitting.set(true);
    this.error.set(null);
    this.api.post('/reviews', { productId: this.productId, rating: this.rating(), text: this.text }).subscribe({
      next: () => { this.submitting.set(false); this.mine.set(true); this.load(); },
      error: (e) => { this.error.set(e?.message ?? 'Could not post review'); this.submitting.set(false); },
    });
  }
}
