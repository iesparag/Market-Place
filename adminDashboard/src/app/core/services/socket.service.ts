import { Injectable, inject, signal } from '@angular/core';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, type SocketEventPayloads } from '@app/shared';
import { environment } from '../../../environments/environment';
import { NotificationService } from './notification.service';
import { playAlertBeep } from '../../shared/alert-sound';

type OrderStatusUpdated = SocketEventPayloads[typeof SOCKET_EVENTS.ORDER_STATUS_UPDATED];
type DeliveryLocation = SocketEventPayloads[typeof SOCKET_EVENTS.DELIVERY_LOCATION];

/**
 * Connects with the auth token and turns inbound realtime events into UI toasts.
 * A vendor is auto-joined to store:{id}, admins to the admin room (server side),
 * so new orders arrive live. See docs/08-STRUCTURE.md (realtime).
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly notify = inject(NotificationService);
  private socket: Socket | null = null;
  private joinedOrderId: string | null = null;

  /** Delivery-task-level status pushes for whichever order is joined via [joinOrder] —
   * the Delivery page's live-tracking panel watches this (admins are auto-joined to
   * the admin room, but a specific order's sub-order updates only reach that order's
   * own room, same as the customer-facing clients). */
  readonly lastStatus = signal<OrderStatusUpdated | null>(null);
  /** Live rider GPS for the joined order. */
  readonly lastLocation = signal<DeliveryLocation | null>(null);

  connect(token: string): void {
    if (this.socket) return;
    this.socket = io(environment.socketUrl, { auth: { token } });
    this.socket.on(SOCKET_EVENTS.ORDER_STATUS_UPDATED, (p: OrderStatusUpdated) => this.lastStatus.set(p));
    this.socket.on(SOCKET_EVENTS.DELIVERY_LOCATION, (p: DeliveryLocation) => this.lastLocation.set(p));
    if (this.joinedOrderId) this.socket.emit('order:join', this.joinedOrderId);

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
    // Delivery task offered/assigned/unassigned — rings so it's noticed even if the
    // admin isn't looking at the Delivery tab (see delivery-tasks.service.ts / auto-assign.service.ts).
    this.socket.on(
      SOCKET_EVENTS.DELIVERY_TASK_EVENT,
      (p: SocketEventPayloads[typeof SOCKET_EVENTS.DELIVERY_TASK_EVENT]) => {
        playAlertBeep();
        const label = {
          offered: `Offered to ${p.riderName ?? 'a rider'} 🔔`,
          assigned: `Assigned to ${p.riderName ?? 'a rider'} ✅`,
          reassigned: `Reassigned to ${p.riderName ?? 'a rider'} 🔁`,
          unassigned: 'Unassigned — needs a rider ⚠️',
        }[p.kind];
        this.notify.push(label, p.orderNumber, p.kind === 'unassigned' ? 'warning' : 'info');
      },
    );
  }

  /** Watch one order's room for live delivery-task status + rider GPS — opened when
   * the Delivery page's "Track" panel is open, closed when it isn't (an admin has no
   * reason to keep pulling GPS for an order they've stopped looking at). */
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
