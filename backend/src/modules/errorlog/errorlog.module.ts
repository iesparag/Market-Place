import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { emailProvider } from '../../providers/email/index.js';
import { ErrorLog } from './error-log.model.js';

/**
 * `/errors`
 *  - GET /           (admin, errors:view) → paginated, filterable error log list.
 *  - GET /summary     (admin, errors:view) → per-day counts for the last N days, for a dashboard chart.
 *  - GET /:id          (admin, errors:view) → one row with full stack/body for debugging.
 */
export const errorLogRoutes = Router();

// Keep logged payloads small — request bodies can carry file uploads or long text.
const MAX_FIELD_LEN = 2000;
function trim(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  const json = JSON.stringify(value);
  if (!json) return undefined;
  return json.length > MAX_FIELD_LEN ? JSON.parse(json.slice(0, MAX_FIELD_LEN) + '"...(truncated)"') : value;
}

/** Fire-and-forget write, called from the global error middleware. Never throws. */
export function captureErrorLog(
  req: Request,
  info: { statusCode: number; code: string; message: string; stack?: string },
): void {
  ErrorLog.create({
    method: req.method,
    path: req.originalUrl?.split('?')[0] ?? req.path,
    statusCode: info.statusCode,
    code: info.code,
    message: info.message,
    stack: info.stack,
    userId: req.user?.id,
    storeId: req.user?.storeId ?? req.storeId,
    ip: req.ip,
    query: trim(req.query),
    params: trim(req.params),
    body: trim(req.body),
  })
    .then(() => void checkSpikeAndAlert())
    .catch((err) => logger.error({ err }, 'Failed to persist ErrorLog'));
}

// A burst of failures is the signal worth waking someone up for — a single scattered
// 500 isn't. In-memory cooldown (not DB-backed) is enough here: it only needs to survive
// one process's uptime, and surviving a restart by re-alerting once is harmless.
const SPIKE_THRESHOLD = 5;
const SPIKE_WINDOW_MS = 10 * 60_000; // 10 minutes
const ALERT_COOLDOWN_MS = 30 * 60_000; // don't alert again for 30 minutes after one fires
let lastAlertAt = 0;

async function checkSpikeAndAlert(): Promise<void> {
  if (!env.ERROR_ALERT_EMAIL) return; // alerting is opt-in — unset = disabled, like every other optional integration here
  if (Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) return;

  const since = new Date(Date.now() - SPIKE_WINDOW_MS);
  const recent = await ErrorLog.find({ createdAt: { $gte: since } }).select('path statusCode message').lean();
  if (recent.length < SPIKE_THRESHOLD) return;

  lastAlertAt = Date.now(); // claim before sending — a slow send must not let a second trigger double-fire
  const byPath = new Map<string, number>();
  for (const r of recent) byPath.set(r.path, (byPath.get(r.path) ?? 0) + 1);
  const topRows = [...byPath.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => `<tr><td>${path}</td><td>${count}</td></tr>`)
    .join('');

  await emailProvider
    .send({
      to: env.ERROR_ALERT_EMAIL,
      subject: `⚠️ ${recent.length} server errors in the last 10 minutes`,
      html: `<p>${recent.length} failed requests (5xx) in the last 10 minutes — more than the usual noise.</p>
        <table border="1" cellpadding="6"><tr><th>Route</th><th>Count</th></tr>${topRows}</table>
        <p>Check the Error Reports dashboard for details.</p>`,
    })
    .catch((err) => logger.error({ err }, 'Failed to send error-spike alert email'));
}

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  statusCode: z.coerce.number().int().optional(),
  path: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

errorLogRoutes.get(
  '/',
  authenticate,
  authorize('errors:view'),
  asyncHandler(async (req, res) => {
    const { page, limit, statusCode, path, from, to } = ListQuery.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (statusCode) filter.statusCode = statusCode;
    if (path) filter.path = { $regex: path, $options: 'i' };
    if (from || to) {
      filter.createdAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }
    const [items, total] = await Promise.all([
      ErrorLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-stack -body -query -params')
        .lean(),
      ErrorLog.countDocuments(filter),
    ]);
    ok(res, { items, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
  }),
);

errorLogRoutes.get(
  '/summary',
  authenticate,
  authorize('errors:view'),
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const byDay = await ErrorLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          serverErrors: { $sum: { $cond: [{ $gte: ['$statusCode', 500] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const topRoutes = await ErrorLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { path: '$path', statusCode: '$statusCode' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    ok(res, { byDay, topRoutes });
  }),
);

errorLogRoutes.get(
  '/:id',
  authenticate,
  authorize('errors:view'),
  asyncHandler(async (req, res) => {
    const doc = await ErrorLog.findById(req.params.id).lean();
    ok(res, doc);
  }),
);
