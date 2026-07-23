import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { env } from '../config/env.js';
import type { AuthUser } from '../common/types.js';

/** Socket.IO handshake auth: verify the JWT passed via auth.token. */
export function socketAuth(socket: Socket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    next(new Error('unauthorized'));
    return;
  }
  try {
    const user = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
    (socket.data as { user: AuthUser }).user = user;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
}
