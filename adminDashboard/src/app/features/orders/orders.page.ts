import { Component, inject, OnInit, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { downloadCsv } from '../../shared/csv';

interface Order {
  _id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  amounts: { grandTotal: number };
  items: { title: string; qty: number; storeId: string }[];
  contact?: { name?: string };
}

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [SlicePipe, HasPermissionDirective],
  template: `
    <header class="head">
      <div><h1>Orders</h1><p class="muted">Live — new orders appear as they come in</p></div>
      <div class="hactions">
        <button class="btn btn-sm" (click)="exportCsv()">⬇ CSV</button>
        <button class="btn btn-ghost btn-sm" (click)="load()">↻ Refresh</button>
      </div>
    </header>

    <div class="card card--flush">
      <table class="table">
        <thead>
          <tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th><th></th></tr>
        </thead>
        <tbody>
          @for (o of orders(); track o._id) {
            <tr>
              <td>{{ o.orderNumber }}</td>
              <td>{{ o.contact?.name || '—' }}</td>
              <td>{{ o.items.length }}</td>
              <td>₹{{ o.amounts.grandTotal / 100 }}</td>
              <td>
                <span class="badge" [class.badge-success]="o.status === 'fulfilled' || o.status === 'paid'"
                      [class.badge-warning]="o.status === 'pending'"
                      [class.badge-danger]="o.status === 'cancelled'">{{ o.status }}</span>
              </td>
              <td class="muted">{{ o.createdAt | slice: 0:10 }}</td>
              <td class="actions">
                <ng-container *hasPermission="'suborder:update'">
                  @if (o.status === 'pending') {
                    <button class="btn btn-primary btn-sm" (click)="setStatus(o, 'paid')">Mark paid</button>
                    <button class="btn btn-ghost btn-sm" (click)="setStatus(o, 'cancelled')">Cancel</button>
                  }
                  @if (o.status === 'paid') {
                    <button class="btn btn-primary btn-sm" (click)="setStatus(o, 'fulfilled')">Fulfill</button>
                  }
                  <button class="btn btn-ghost btn-sm" (click)="resend(o)" title="Re-send current status to the customer (socket + notification)">📣 Re-send</button>
                </ng-container>
                @if (o.status === 'paid' || o.status === 'fulfilled') {
                  <button class="btn btn-ghost btn-sm refund" (click)="refund(o)" *hasPermission="'order:refund'">Refund</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="pad muted">No orders yet.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .head h1 { margin-bottom: 2px; }
      .hactions { display: flex; gap: 8px; }
      .pad { padding: 16px; }
      .actions { white-space: nowrap; display: flex; gap: 6px; }
    `,
  ],
})
export class OrdersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  orders = signal<Order[]>([]);

  ngOnInit(): void { this.load(); }
  load(): void {
    this.api.get<Order[]>('/orders').subscribe({ next: (o) => this.orders.set(o) });
  }

  setStatus(o: Order, status: string): void {
    this.api.patch<Order>(`/orders/${o._id}/status`, { status }).subscribe({
      next: () => {
        this.notify.push('Order updated', `${o.orderNumber} → ${status}`, 'success');
        this.load();
      },
      error: (e) => this.notify.push('Update failed', e?.message, 'warning'),
    });
  }

  resend(o: Order): void {
    this.api.post(`/orders/${o._id}/resend`, {}).subscribe({
      next: () => this.notify.push('Update re-sent', `${o.orderNumber} → ${o.status}`, 'success'),
      error: (e) => this.notify.push('Re-send failed', e?.message, 'warning'),
    });
  }

  refund(o: Order): void {
    if (!confirm(`Refund ${o.orderNumber}? This reverses the vendor payout + commission.`)) return;
    this.api.post<Order>(`/orders/${o._id}/refund`, {}).subscribe({
      next: () => { this.notify.push('Refunded', o.orderNumber, 'success'); this.load(); },
      error: (e) => this.notify.push('Refund failed', e?.message, 'warning'),
    });
  }

  exportCsv(): void {
    downloadCsv('orders.csv', this.orders(), [
      { label: 'Order', value: (o) => o.orderNumber },
      { label: 'Customer', value: (o) => o.contact?.name ?? '' },
      { label: 'Items', value: (o) => o.items.length },
      { label: 'Total (₹)', value: (o) => o.amounts.grandTotal / 100 },
      { label: 'Status', value: (o) => o.status },
      { label: 'Date', value: (o) => o.createdAt },
    ]);
  }
}
