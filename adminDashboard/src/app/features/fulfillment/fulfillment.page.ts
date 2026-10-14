import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { matchesSearch } from '../../shared/search';

interface DeliveryTask {
  _id: string;
  orderId: string;
  orderNumber: string;
  storeId: string;
  status:
    | 'pending'
    | 'accepted'
    | 'preparing'
    | 'ready'
    | 'pickup_started'
    | 'pickup_arrived'
    | 'picked_up'
    | 'delivery_started'
    | 'delivery_arrived'
    | 'delivered'
    | 'cancelled'
    | 'refunded';
  fulfillmentSource: 'own_fleet' | 'third_party';
  items: { title?: string; qty: number }[];
  riderId?: string;
  createdAt: string;
}

const NEXT: Record<string, { label: string; status: string } | undefined> = {
  pending: { label: 'Accept', status: 'accepted' },
  accepted: { label: 'Start preparing', status: 'preparing' },
  preparing: { label: 'Mark ready for pickup', status: 'ready' },
};

/**
 * Per-vendor fulfillment: accept → prepare → ready-for-pickup. This is the "did the
 * store do its job" lifecycle — who actually picks it up and delivers it (our own
 * rider vs a third-party courier) is the Delivery page's job, not this one.
 */
@Component({
  selector: 'app-fulfillment',
  standalone: true,
  imports: [SlicePipe, FormsModule, HasPermissionDirective],
  template: `
    <header class="head">
      <div><h1>Fulfillment</h1><p class="muted">Per-store order prep — accept, prepare, hand off for pickup</p></div>
      <button class="btn btn-ghost btn-sm" (click)="load()">↻ Refresh</button>
    </header>

    <div class="toolbar">
      <input class="input search" [(ngModel)]="q" placeholder="Search by order number or status…" />
      <select class="input status-filter" [(ngModel)]="statusFilter" (change)="load()">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="accepted">Accepted</option>
        <option value="preparing">Preparing</option>
        <option value="ready">Ready for pickup</option>
        <option value="pickup_started">Rider heading to pickup</option>
        <option value="pickup_arrived">Rider at the store</option>
        <option value="picked_up">Picked up</option>
        <option value="delivery_started">Out for delivery</option>
        <option value="delivery_arrived">Rider arrived</option>
        <option value="delivered">Delivered</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <span class="count muted">{{ filtered().length }} of {{ tasks().length }}</span>
    </div>

    <div class="card card--flush">
      <table class="table">
        <thead>
          <tr><th>Order</th><th>Items</th><th>Source</th><th>Status</th><th>Date</th><th></th></tr>
        </thead>
        <tbody>
          @for (t of filtered(); track t._id) {
            <tr>
              <td><b>{{ t.orderNumber }}</b></td>
              <td>{{ itemsSummary(t) }}</td>
              <td>
                <span class="badge" [class.badge-info]="t.fulfillmentSource === 'third_party'">
                  {{ t.fulfillmentSource === 'third_party' ? 'Third-party courier' : 'Own fleet' }}
                </span>
              </td>
              <td>
                <span class="badge"
                      [class.badge-success]="t.status === 'delivered' || t.status === 'ready'"
                      [class.badge-warning]="t.status === 'pending' || t.status === 'accepted' || t.status === 'preparing'"
                      [class.badge-danger]="t.status === 'cancelled' || t.status === 'refunded'"
                      [class.badge-info]="isInTransit(t.status)">{{ statusLabel(t.status) }}</span>
              </td>
              <td class="muted">{{ t.createdAt | slice: 0:10 }}</td>
              <td class="actions">
                <ng-container *hasPermission="'suborder:update'">
                  @if (next(t); as n) {
                    <button class="btn btn-primary btn-sm" [disabled]="busy() === t._id" (click)="advance(t, n.status)">{{ n.label }}</button>
                  }
                  @if (cancellable(t)) {
                    <button class="btn btn-ghost btn-sm cancel" [disabled]="busy() === t._id" (click)="advance(t, 'cancelled')">Cancel</button>
                  }
                </ng-container>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="pad muted">{{ q || statusFilter ? 'No tasks match.' : 'No fulfillment tasks yet.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
      .head h1 { margin-bottom: 2px; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
      .search { flex: 1; max-width: 320px; }
      .status-filter { max-width: 200px; }
      .count { white-space: nowrap; }
      .pad { padding: 16px; }
      .actions { white-space: nowrap; display: flex; gap: 6px; justify-content: flex-end; }
      .cancel { color: var(--danger); }
    `,
  ],
})
export class FulfillmentPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotificationService);
  tasks = signal<DeliveryTask[]>([]);
  busy = signal<string | null>(null);
  q = '';
  statusFilter = '';

  filtered(): DeliveryTask[] {
    return this.tasks().filter((t) => matchesSearch(this.q, t.orderNumber, t.status));
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const params: Record<string, string | number> = {};
    if (this.statusFilter) params['status'] = this.statusFilter;
    this.api.get<DeliveryTask[]>('/delivery', params).subscribe({
      next: (rows) => this.tasks.set(rows),
      error: (e) => this.notify.push('Could not load fulfillment tasks', e?.message, 'warning'),
    });
  }

  itemsSummary(t: DeliveryTask): string {
    const count = t.items.reduce((n, i) => n + i.qty, 0);
    const first = t.items[0]?.title ?? 'item';
    return t.items.length > 1 ? `${first} +${t.items.length - 1} more (${count})` : `${first} ×${count}`;
  }

  statusLabel(s: string): string {
    return (
      {
        pending: 'Pending',
        accepted: 'Accepted',
        preparing: 'Preparing',
        ready: 'Ready for pickup',
        pickup_started: 'Rider heading to pickup',
        pickup_arrived: 'Rider at the store',
        picked_up: 'Picked up',
        delivery_started: 'Out for delivery',
        delivery_arrived: 'Rider arrived',
        delivered: 'Delivered',
        cancelled: 'Cancelled',
        refunded: 'Refunded',
      }[s] ?? s
    );
  }

  /** The 5 rider-controlled pickup/delivery sub-stages — shown with the "in progress" badge. */
  isInTransit(status: string): boolean {
    return ['pickup_started', 'pickup_arrived', 'picked_up', 'delivery_started', 'delivery_arrived'].includes(status);
  }

  next(t: DeliveryTask): { label: string; status: string } | undefined {
    return NEXT[t.status];
  }

  cancellable(t: DeliveryTask): boolean {
    return ['pending', 'accepted', 'preparing'].includes(t.status);
  }

  advance(t: DeliveryTask, status: string): void {
    this.busy.set(t._id);
    this.api.patch(`/delivery/${t._id}/status`, { status }).subscribe({
      next: () => {
        this.busy.set(null);
        this.notify.push('Updated', `${t.orderNumber} → ${this.statusLabel(status)}`, 'success');
        this.load();
      },
      error: (e) => {
        this.busy.set(null);
        this.notify.push('Update failed', e?.message, 'warning');
      },
    });
  }
}
