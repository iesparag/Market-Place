import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, type OrderStatusUpdated, type NotificationNew } from '@app/shared';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/**
 * Browser-only realtime. Connecting joins the customer's user room server-side,
 * so order status updates (paid / fulfilled) arrive live. SSR never connects.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly auth = inject(AuthService);
  private socket: Socket | null = null;

  /** Latest status push — pages watch this to update live. */
  readonly lastStatus = signal<OrderStatusUpdated | null>(null);
  /** Latest per-user notification push — the bell watches this. */
  readonly lastNotification = signal<NotificationNew | null>(null);

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
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
