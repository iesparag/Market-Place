import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { env } from '../config/env.js';
import type { AuthUser } from '../common/types.js';
import type { RiderAuthPayload } from '../modules/riders/rider.types.js';

/**
 * Socket.IO handshake auth: verify the JWT passed via auth.token. Accepts either a
 * marketplace User token or a Rider token (same secret, different payload shape —
 * see RiderAuthPayload's `type: 'rider'` discriminator) since the rider app connects
 * on this same socket server, not a separate one.
 */
export function socketAuth(socket: Socket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    next(new Error('unauthorized'));
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser | RiderAuthPayload;
    if ('type' in payload && payload.type === 'rider') {
      (socket.data as { rider: RiderAuthPayload }).rider = payload;
    } else {
      (socket.data as { user: AuthUser }).user = payload as AuthUser;
    }
    next();
  } catch {
    next(new Error('unauthorized'));
  }
}
