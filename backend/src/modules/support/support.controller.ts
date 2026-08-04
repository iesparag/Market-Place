import type { Request, Response } from 'express';
import { z } from 'zod';
import { SupportIntentEnum, SupportTicketStatusEnum } from '@app/shared';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import {
  SupportConfig,
  getSupportConfig,
  getSupportConfigPublic,
} from './support.model.js';
import * as service from './support.service.js';

const messageText = z.string().trim().min(1).max(2000);

// ── customer ─────────────────────────────────────────────────────────────────
async function startThread(req: Request, res: Response) {
  const body = z
    .object({
      orderId: z.string().optional(),
      storeId: z.string().optional(),
      channel: z.enum(['app', 'web', 'admin']).optional(),
    })
    .parse(req.body ?? {});
  created(res, await service.getOrCreateThread(req.user!, body));
}

async function getThread(req: Request, res: Response) {
  ok(res, await service.getMyThread(req.user!, req.params.id!));
}

async function listMyThreads(req: Request, res: Response) {
  ok(res, await service.listMyThreads(req.user!));
}

async function sendMessage(req: Request, res: Response) {
  const text = messageText.parse(req.body?.text);
  ok(res, await service.postCustomerMessage(req.user!, req.params.id!, text));
}

// ── admin / vendor ───────────────────────────────────────────────────────────
async function listTickets(req: Request, res: Response) {
  const q = z
    .object({
      status: z.string().optional(),
      intent: z.string().optional(),
      sentiment: z.string().optional(),
      storeId: z.string().optional(),
      limit: z.coerce.number().optional(),
    })
    .parse(req.query);
  ok(res, await service.listTickets(req.user!, q));
}

async function getTicket(req: Request, res: Response) {
  ok(res, await service.getTicket(req.user!, req.params.id!));
}

async function replyTicket(req: Request, res: Response) {
  const text = messageText.parse(req.body?.text);
  ok(res, await service.replyToTicket(req.user!, req.params.id!, text));
}

async function regenerate(req: Request, res: Response) {
  ok(res, await service.regenerateSuggestion(req.user!, req.params.id!));
}

async function assignTicket(req: Request, res: Response) {
  const patch = z
    .object({
      assigneeId: z.string().optional(),
      status: SupportTicketStatusEnum.optional(),
      resolution: z.string().max(2000).optional(),
    })
    .parse(req.body ?? {});
  ok(res, await service.updateTicket(req.user!, req.params.id!, patch));
}

// ── config (admin controls every feature) ────────────────────────────────────
const ConfigSchema = z
  .object({
    botEnabled: z.boolean().optional(),
    channels: z.object({ app: z.boolean(), web: z.boolean() }).partial().optional(),
    greeting: z.string().max(500).optional(),
    handoffMessage: z.string().max(500).optional(),
    selfService: z
      .object({
        trackOrder: z.boolean(),
        viewInvoice: z.boolean(),
        cancelUnshipped: z.boolean(),
        reorder: z.boolean(),
      })
      .partial()
      .optional(),
    autoReply: z
      .object({
        enabled: z.boolean(),
        minConfidence: z.number().min(0).max(1),
        businessHoursOnly: z.boolean(),
        // { where_is_order: true, return_or_refund: false, ... }
        byIntent: z.record(SupportIntentEnum, z.boolean()),
      })
      .partial()
      .optional(),
    slaMinutes: z.number().int().min(1).max(10080).optional(),
    ratePerMin: z.number().int().min(1).max(600).optional(),
  })
  .strict();

async function getConfig(_req: Request, res: Response) {
  ok(res, await getSupportConfig());
}

async function publicConfig(_req: Request, res: Response) {
  ok(res, await getSupportConfigPublic());
}

async function updateConfig(req: Request, res: Response) {
  const patch = ConfigSchema.parse(req.body ?? {});
  if (Object.keys(patch).length === 0) throw AppError.badRequest('NO_FIELDS', 'Nothing to update');
  // Flatten nested objects to dotted paths so we only overwrite provided keys.
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [nk, nv] of Object.entries(v)) set[`${k}.${nk}`] = nv;
    } else {
      set[k] = v;
    }
  }
  const doc = await SupportConfig.findOneAndUpdate(
    { key: 'support' },
    { $set: set, $setOnInsert: { key: 'support' } },
    { new: true, upsert: true },
  ).lean();
  ok(res, doc);
}

export const supportController = {
  startThread,
  getThread,
  listMyThreads,
  sendMessage,
  listTickets,
  getTicket,
  replyTicket,
  regenerate,
  assignTicket,
  getConfig,
  publicConfig,
  updateConfig,
};
