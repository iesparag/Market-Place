import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from '../../common/apiResponse.js';

export const healthRoutes = Router();

healthRoutes.get('/health', (_req, res) => {
  ok(res, {
    status: 'up',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    ts: new Date().toISOString(),
  });
});
