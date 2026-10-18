import { Router } from 'express';
import { z } from 'zod';
import { SOCKET_EVENTS } from '@app/shared';
import { authenticateRider } from '../../middleware/authenticateRider.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { safeEmit, emitToAdmin } from '../../realtime/emitters.js';
import { SupportThread, SupportTicket, getSupportConfig } from './support.model.js';

/**
 * `/rider-support` — a rider's own help channel, structurally parallel to `/support`
 * but deliberately simpler: no bot/tool orchestration (riders have no "orders" to
 * self-serve on — a payout dispute or app bug always needs a human), so every
 * message goes straight into a ticket. Reuses the same SupportThread/SupportTicket
 * models + the admin inbox (support-inbox.page.ts) riders' tickets show up there
 * tagged by `riderId` instead of `customerId`.
 */
export const riderSupportRoutes = Router();
riderSupportRoutes.use(authenticateRider);

const RIDER_CATEGORIES = ['payout_issue', 'delivery_issue', 'app_issue', 'account', 'other'] as const;
const CATEGORY_LABEL: Record<(typeof RIDER_CATEGORIES)[number], string> = {
  payout_issue: 'Payout / earnings issue',
  delivery_issue: 'Delivery / task issue',
  app_issue: 'App problem',
  account: 'Account issue',
  other: 'Other',
};

riderSupportRoutes.post(
  '/threads',
  asyncHandler(async (req, res) => {
    const riderId = req.rider!.riderId;
    const existing = await SupportThread.findOne({ riderId, status: { $in: ['open', 'pending_admin'] } }).sort({
      lastMessageAt: -1,
    });
    if (existing) return void ok(res, existing);
    const config = await getSupportConfig();
    const thread = await SupportThread.create({
      riderId,
      channel: 'rider_app',
      status: 'open',
      messages: [{ role: 'system', text: config.greeting }],
      lastMessageAt: new Date(),
    });
    created(res, thread);
  }),
);

riderSupportRoutes.get(
  '/threads/:id',
  asyncHandler(async (req, res) => {
    const thread = await SupportThread.findById(req.params.id);
    if (!thread || String(thread.riderId) !== req.rider!.riderId) throw AppError.notFound('Thread not found');
    ok(res, thread);
  }),
);

const MessageSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  category: z.enum(RIDER_CATEGORIES).optional(),
});

riderSupportRoutes.post(
  '/threads/:id/message',
  asyncHandler(async (req, res) => {
    const riderId = req.rider!.riderId;
    const { text, category } = MessageSchema.parse(req.body ?? {});
    const thread = await SupportThread.findById(req.params.id);
    if (!thread || String(thread.riderId) !== riderId) throw AppError.notFound('Thread not found');

    thread.messages.push({ role: 'customer', text } as never);
    thread.lastMessageAt = new Date();

    const config = await getSupportConfig();
    const slaDueAt = new Date(Date.now() + (config.slaMinutes ?? 120) * 60_000);
    const summary = `${category ? CATEGORY_LABEL[category] : 'Rider support'}: "${text.slice(0, 80)}"`;

    let ticket = thread.ticketId ? await SupportTicket.findById(thread.ticketId) : null;
    if (ticket && (ticket.status === 'resolved' || ticket.status === 'closed')) ticket = null;
    if (ticket) {
      ticket.summary = summary;
      if (category) ticket.intent = category;
      ticket.status = 'open';
      await ticket.save();
    } else {
      ticket = await SupportTicket.create({
        threadId: thread._id,
        riderId,
        intent: category ?? 'other',
        summary,
        status: 'open',
        slaDueAt,
      });
      thread.ticketId = ticket._id as never;
    }

    const botText = config.handoffMessage;
    thread.messages.push({ role: 'bot', text: botText } as never);
    thread.status = 'pending_admin';
    await thread.save();

    safeEmit(() =>
      emitToAdmin(SOCKET_EVENTS.SUPPORT_TICKET_NEW, {
        ticketId: String(ticket!._id),
        threadId: String(thread._id),
        intent: ticket!.intent as never, // rider categories are outside the customer-bot's SupportIntentEnum
        sentiment: 'neutral',
        urgency: ticket!.urgency,
        summary,
        at: new Date().toISOString(),
      }),
    );
    ok(res, { thread, reply: botText, escalated: true, ticketId: String(ticket._id) });
  }),
);

riderSupportRoutes.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    ok(res, RIDER_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABEL[value] })));
  }),
);
