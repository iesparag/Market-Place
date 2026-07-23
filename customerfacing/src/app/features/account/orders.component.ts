import { Component, inject, OnInit, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface Order { _id: string; orderNumber: string; status: string; createdAt: string; amounts: { grandTotal: number }; items: { title: string; qty: number }[]; }

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [RouterLink, SlicePipe],
  template: `
    <h1>My orders</h1>
    @for (o of orders(); track o._id) {
      <a class="card order" [routerLink]="['/order', o._id]">
        <div>
          <div class="num">{{ o.orderNumber }}</div>
          <div class="muted">{{ o.items.length }} item(s) · {{ o.createdAt | slice: 0:10 }}</div>
        </div>
        <div class="right">
          <span class="badge" [class.badge-success]="o.status === 'paid'" [class.badge-warning]="o.status === 'pending'">{{ o.status }}</span>
          <span class="price">₹{{ o.amounts.grandTotal / 100 }}</span>
        </div>
      </a>
    } @empty {
      <div class="card muted">No orders yet. <a routerLink="/catalog">Start shopping</a></div>
    }
  `,
  styles: [
    `
      .order { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .num { font-weight: 600; }
      .right { display: flex; align-items: center; gap: 14px; }
    `,
  ],
})
export class OrdersComponent implements OnInit {
  private readonly api = inject(ApiService);
  orders = signal<Order[]>([]);
  ngOnInit(): void {
    this.api.get<Order[]>('/orders').subscribe({ next: (o) => this.orders.set(o) });
  }
}
