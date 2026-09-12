import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { matchesSearch } from '../../shared/search';

interface Review {
  _id: string; productTitle: string; customerName?: string; rating: number; text: string;
  verified: boolean; status: 'visible' | 'hidden'; createdAt: string;
}

@Component({
  selector: 'app-reviews',
  standalone: true,
  imports: [HasPermissionDirective, FormsModule],
  template: `
    <header class="head"><h1>Reviews</h1><p class="muted">Moderate customer reviews</p></header>
    <div class="toolbar">
      <input class="input search" [(ngModel)]="q" placeholder="Search by product, customer or review text…" />
      <span class="count muted">{{ filtered().length }} of {{ reviews().length }}</span>
    </div>
    <div class="card card--flush">
      <table class="table">
        <thead><tr><th>Product</th><th>By</th><th>Rating</th><th>Review</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (r of filtered(); track r._id) {
            <tr [class.hidden]="r.status === 'hidden'">
              <td>{{ r.productTitle }}</td>
              <td>{{ r.customerName || '—' }} @if (r.verified) { <span class="badge badge-success">verified</span> }</td>
              <td>{{ stars(r.rating) }}</td>
              <td class="txt">{{ r.text || '—' }}</td>
              <td><span class="badge" [class.badge-success]="r.status === 'visible'" [class.badge-danger]="r.status === 'hidden'">{{ r.status }}</span></td>
              <td class="actions" *hasPermission="'review:moderate'">
                <button class="btn btn-ghost btn-sm" (click)="setStatus(r, r.status === 'visible' ? 'hidden' : 'visible')">
                  {{ r.status === 'visible' ? 'Hide' : 'Show' }}
                </button>
              </td>
            </tr>
          } @empty { <tr><td colspan="6" class="pad muted">{{ q ? 'No reviews match your search.' : 'No reviews yet.' }}</td></tr> }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .head { margin-bottom: 20px; } .pad { padding: 16px; } .actions { text-align: right; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
      .search { flex: 1; max-width: 360px; } .count { white-space: nowrap; }
      .txt { max-width: 320px; } tr.hidden td { opacity: 0.5; }
    `,
  ],
})
export class ReviewsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  reviews = signal<Review[]>([]);
  q = '';

  filtered(): Review[] {
    return this.reviews().filter((r) => matchesSearch(this.q, r.productTitle, r.customerName, r.text));
  }

  ngOnInit(): void { this.load(); }
  load(): void { this.api.get<Review[]>('/reviews').subscribe({ next: (r) => this.reviews.set(r) }); }
  stars(n: number): string { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }

  setStatus(r: Review, status: 'visible' | 'hidden'): void {
    this.api.patch(`/reviews/${r._id}`, { status }).subscribe({
      next: () => { this.notify.push('Review ' + (status === 'hidden' ? 'hidden' : 'shown'), r.productTitle, 'success'); this.load(); },
      error: (e) => this.notify.push('Failed', e?.message, 'warning'),
    });
  }
}
