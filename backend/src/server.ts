import { createServer, type Server } from 'http';
import type { Express } from 'express';
import { initSocket } from './realtime/index.js';

/** Wrap the Express app in an HTTP server and attach Socket.IO. */
export function createHttpServer(app: Express): Server {
  const server = createServer(app);
  initSocket(server);
  return server;
}
