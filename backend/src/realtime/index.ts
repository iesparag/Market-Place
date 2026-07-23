import type { Server as HttpServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { AuthUser } from '../common/types.js';
import { socketAuth } from './socket.auth.js';
import { rooms } from './rooms.js';
import { Role } from '@app/shared';

let io: IOServer | null = null;

export function initSocket(server: HttpServer): IOServer {
  io = new IOServer(server, {
    cors: { origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN], credentials: true },
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    const user = (socket.data as { user: AuthUser }).user;
    // Auto-join the caller's personal + store + admin rooms.
    socket.join(rooms.user(user.id));
    if (user.storeId) socket.join(rooms.store(user.storeId));
    if (user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN) socket.join(rooms.admin());

    // Clients can subscribe to a specific order they are viewing.
    socket.on('order:join', (orderId: string) => socket.join(rooms.order(orderId)));
    socket.on('order:leave', (orderId: string) => socket.leave(rooms.order(orderId)));

    logger.debug({ userId: user.id }, 'socket connected');
  });

  logger.info('Socket.IO initialised');
  return io;
}

export function getIO(): IOServer {
  if (!io) throw new Error('Socket.IO not initialised');
  return io;
}
