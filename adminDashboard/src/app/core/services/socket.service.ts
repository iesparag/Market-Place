import { Injectable, inject } from '@angular/core';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, type SocketEventPayloads } from '@app/shared';
import { environment } from '../../../environments/environment';
import { NotificationService } from './notification.service';

/**
 * Connects with the auth token and turns inbound realtime events into UI toasts.
 * A vendor is auto-joined to store:{id}, admins to the admin room (server side),
 * so new orders arrive live. See docs/08-STRUCTURE.md (realtime).
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly notify = inject(NotificationService);
  private socket: Socket | null = null;

  connect(token: string): void {
    if (this.socket) return;
    this.socket = io(environment.socketUrl, { auth: { token } });

    this.socket.on(
      SOCKET_EVENTS.SUBORDER_NEW,
      (p: SocketEventPayloads[typeof SOCKET_EVENTS.SUBORDER_NEW]) =>
        this.notify.push('New order 🛎️', `${p.orderNumber} · ${p.itemsCount} item(s)`, 'success'),
    );
    this.socket.on(
      SOCKET_EVENTS.NOTIFICATION_NEW,
      (p: SocketEventPayloads[typeof SOCKET_EVENTS.NOTIFICATION_NEW]) =>
        this.notify.push(p.title, p.body, 'info'),
    );
    this.socket.on(
      SOCKET_EVENTS.INVENTORY_CHANGED,
      (p: SocketEventPayloads[typeof SOCKET_EVENTS.INVENTORY_CHANGED]) =>
        this.notify.push('Low stock ⚠️', `${p.variantSku} · ${p.stock} left`, 'warning'),
    );
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
