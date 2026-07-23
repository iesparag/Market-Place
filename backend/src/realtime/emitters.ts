import type { SocketEvent, SocketEventPayloads } from '@app/shared';
import { getIO } from './index.js';
import { rooms } from './rooms.js';

/**
 * Typed emit helpers. Services never touch `io` directly — they call these,
 * so payloads stay in sync with shared/events. See docs/08-STRUCTURE.md.
 */
export function emitToUser<E extends SocketEvent>(
  userId: string,
  event: E,
  payload: SocketEventPayloads[E],
): void {
  getIO().to(rooms.user(userId)).emit(event, payload);
}

export function emitToStore<E extends SocketEvent>(
  storeId: string,
  event: E,
  payload: SocketEventPayloads[E],
): void {
  getIO().to(rooms.store(storeId)).emit(event, payload);
}

export function emitToOrder<E extends SocketEvent>(
  orderId: string,
  event: E,
  payload: SocketEventPayloads[E],
): void {
  getIO().to(rooms.order(orderId)).emit(event, payload);
}

export function emitToAdmin<E extends SocketEvent>(event: E, payload: SocketEventPayloads[E]): void {
  getIO().to(rooms.admin()).emit(event, payload);
}

/** Fire-and-forget: emit helpers should never break a request if sockets aren't ready. */
export function safeEmit(fn: () => void): void {
  try {
    fn();
  } catch {
    /* socket not initialised (e.g. seed script) — ignore */
  }
}
