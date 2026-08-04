import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { env } from '../../config/env.js';
import { supportController as c } from './support.controller.js';

export const supportRoutes = Router();

// Per-user cap on bot messages (cost + abuse guard). Runs after authenticate so req.user exists.
const messageLimiter = rateLimit({
  windowMs: 60_000,
  max: env.SUPPORT_RATE_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? 'anon',
});

// ── Public (customer surfaces read this to know if the bot is on) ─────────────
supportRoutes.get('/config/public', asyncHandler(c.publicConfig));

// ── Customer (storefront token; no special permission — bot rides their own rights) ──
supportRoutes.post('/threads', authenticate, asyncHandler(c.startThread));
supportRoutes.get('/threads', authenticate, asyncHandler(c.listMyThreads));
supportRoutes.get('/threads/:id', authenticate, asyncHandler(c.getThread));
supportRoutes.post('/threads/:id/message', authenticate, messageLimiter, asyncHandler(c.sendMessage));

// ── Admin / vendor inbox (store-scoped for vendors) ──────────────────────────
supportRoutes.get('/tickets', authenticate, authorize('support:read'), asyncHandler(c.listTickets));
supportRoutes.get('/tickets/:id', authenticate, authorize('support:read'), asyncHandler(c.getTicket));
supportRoutes.post('/tickets/:id/reply', authenticate, authorize('support:reply'), asyncHandler(c.replyTicket));
supportRoutes.post('/tickets/:id/regenerate', authenticate, authorize('support:reply'), asyncHandler(c.regenerate));
supportRoutes.post('/tickets/:id/assign', authenticate, authorize('support:assign'), asyncHandler(c.assignTicket));

// ── Config (admin owns every feature toggle) ─────────────────────────────────
supportRoutes.get('/config', authenticate, authorize('support:config'), asyncHandler(c.getConfig));
supportRoutes.put('/config', authenticate, authorize('support:config'), asyncHandler(c.updateConfig));
