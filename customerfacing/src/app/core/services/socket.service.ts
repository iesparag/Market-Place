import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, type OrderStatusUpdated, type NotificationNew, type DeliveryLocation } from '@app/shared';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/**
 * Browser-only realtime. Connecting joins the customer's user room server-side,
 * so top-level order status updates (paid / fulfilled) arrive live without any
 * extra step. Per-delivery-task status (pickup_started, picked_up, …) and live
 * rider GPS only broadcast to that order's own room — join it explicitly with
 * [joinOrder] while a tracking screen is open. SSR never connects.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly auth = inject(AuthService);
  private socket: Socket | null = null;
  private joinedOrderId: string | null = null;

  /** Latest status push — pages watch this to update live. Carries `subOrderId` when
   * it's a delivery-task-level update rather than the order's own top-level status. */
  readonly lastStatus = signal<OrderStatusUpdated | null>(null);
  /** Latest per-user notification push — the bell watches this. */
  readonly lastNotification = signal<NotificationNew | null>(null);
  /** Latest rider GPS fix for whichever order is currently joined via [joinOrder]. */
  readonly lastLocation = signal<DeliveryLocation | null>(null);

  connect(): void {
    if (!isPlatformBrowser(this.platformId) || this.socket) return;
    const token = this.auth.token();
    if (!token) return;
    this.socket = io(environment.socketUrl, { auth: { token } });
    this.socket.on(SOCKET_EVENTS.ORDER_STATUS_UPDATED, (p: OrderStatusUpdated) =>
      this.lastStatus.set(p),
    );
    this.socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, (p: NotificationNew) =>
      this.lastNotification.set(p),
    );
    this.socket.on(SOCKET_EVENTS.DELIVERY_LOCATION, (p: DeliveryLocation) =>
      this.lastLocation.set(p),
    );
    if (this.joinedOrderId) this.socket.emit('order:join', this.joinedOrderId);
  }

  /** Subscribe to one order's room — delivery-task status + rider GPS for it only.
   * Call again with a different id to switch; call [leaveOrder] when the tracking
   * screen closes so the socket doesn't keep receiving GPS for an order no one's
   * watching. connect() must have been called first (or will be, then auto-joins). */
  joinOrder(orderId: string): void {
    if (this.joinedOrderId === orderId) return;
    if (this.joinedOrderId) this.socket?.emit('order:leave', this.joinedOrderId);
    this.joinedOrderId = orderId;
    this.socket?.emit('order:join', orderId);
  }

  leaveOrder(): void {
    if (!this.joinedOrderId) return;
    this.socket?.emit('order:leave', this.joinedOrderId);
    this.joinedOrderId = null;
    this.lastLocation.set(null);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.joinedOrderId = null;
  }
}
