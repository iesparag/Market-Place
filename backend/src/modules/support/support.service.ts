import { Role, SOCKET_EVENTS, type SupportIntent } from '@app/shared';
import { AppError } from '../../common/AppError.js';
import type { AuthUser } from '../../common/types.js';
import { emitToUser, emitToAdmin, emitToStore, emitToRider, safeEmit } from '../../realtime/emitters.js';
import { aiProvider, type ChatTurn } from '../../providers/ai/index.js';
import { writeAudit } from '../audit/audit.module.js';
import { runTool, toolSpecs, type ToolContext } from './tools/registry.js';
import { Order } from '../orders/order.model.js';
import {
  SupportThread,
  SupportTicket,
  getSupportConfig,
  type SupportConfigDoc,
} from './support.model.js';

/**
 * Grounding contract handed to the LLM (S2 uses it; the stub ignores it). The bot answers
 * only from retrieved context + tool results, and escalates anything it can't/ shouldn't do —
 * it has NO tool that spends money, so a refund can only ever happen via a human ticket.
 */
export const SUPPORT_SYSTEM_PROMPT =
  'You are a customer-support assistant for an online marketplace. Answer ONLY from the ' +
  'provided order data and knowledge-base context — call search_kb for policy questions ' +
  '(returns, shipping, cancellation windows) instead of guessing. Never invent order facts, ' +
  'prices or policy. You may perform safe self-service actions the customer already owns ' +
  '(track, invoice, cancel-if-unshipped, reorder). For refunds, post-shipment cancellations, ' +
  'discounts, or anything you are unsure about, call escalate_to_support — never tell the ' +
  'customer a refund/discount/exception is approved, processed, or on its way: only a human ' +
  'reviewing the ticket can approve that, so say it has been passed to the team for review.';

// ── helpers ──────────────────────────────────────────────────────────────────
type LeanThread = { _id: unknown; customerId: unknown; storeId?: unknown };
type LeanTicket = { storeId?: unknown };

function isPlatformStaff(user: AuthUser): boolean {
  return user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN;
}
function isVendor(user: AuthUser): boolean {
  return user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF;
}

/** Platform staff see every ticket; a vendor may only touch tickets for their own store (rule 7). */
function assertTicketAccess(user: AuthUser, ticket: LeanTicket): void {
  if (isPlatformStaff(user)) return;
  if (isVendor(user) && ticket.storeId && String(ticket.storeId) === String(user.storeId)) return;
  throw AppError.forbidden('You cannot access this ticket');
}

/** A first-pass admin draft per intent. Real grounded drafts (RAG + order data) land in S3. */
const DRAFTS: Record<SupportIntent, string> = {
  where_is_order:
    "Hi, thanks for reaching out! I've checked your order — it's on the way and expected shortly. I'll keep an eye on it and update you if anything changes.",
  return_or_refund:
    "Hi, I'm sorry for the trouble. I've noted your return request with the item and reason — our team is reviewing it and will confirm the refund/replacement shortly.",
  cancel_order:
    "Hi, I've passed this cancellation request to our team since the order's already past the point I can cancel it myself — they'll confirm shortly.",
  order_issue:
    "Hi, I'm really sorry your order arrived with an issue. I've shared the details with our team and they'll follow up with next steps shortly.",
  payment_issue:
    "Hi, thanks for flagging this. I'm checking the payment on your order now and will confirm the status and next steps shortly.",
  product_question:
    'Hi! Happy to help with this product — could you tell me exactly what you’d like to know? I’ll get you the details.',
  account:
    "Hi, I can help with your account. Could you tell me a bit more about what you're trying to do?",
  general: 'Hi, thanks for reaching out! Could you share a little more detail so I can help?',
  other: 'Hi, thanks for reaching out! Could you share a little more detail so I can help?',
};

function toTurns(messages: { role: string; text: string }[]): ChatTurn[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'customer' ? 'user' : 'assistant', content: m.text }) as ChatTurn);
}
function transcript(messages: { role: string; text: string }[]): string {
  return messages.map((m) => `${m.role}: ${m.text}`).join('\n');
}
function lastCustomerText(messages: { role: string; text: string }[]): string {
  return [...messages].reverse().find((m) => m.role === 'customer')?.text ?? '';
}

// ── customer-facing ──────────────────────────────────────────────────────────
/** Reuse the customer's active (non-closed) thread for this context, else start a new one. */
export async function getOrCreateThread(
  user: AuthUser,
  opts: { orderId?: string; storeId?: string; channel?: 'app' | 'web' | 'admin' } = {},
) {
  const config = await getSupportConfig();
  const filter: Record<string, unknown> = {
    customerId: user.id,
    status: { $in: ['bot', 'open', 'pending_admin'] },
  };
  if (opts.orderId) filter.orderId = opts.orderId;
  const existing = await SupportThread.findOne(filter).sort({ lastMessageAt: -1 });
  if (existing) return existing;

  return SupportThread.create({
    customerId: user.id,
    storeId: opts.storeId,
    orderId: opts.orderId,
    channel: opts.channel ?? 'web',
    status: 'bot',
    messages: [{ role: 'system', text: config.greeting }],
    lastMessageAt: new Date(),
  });
}

export async function getMyThread(user: AuthUser, threadId: string) {
  const thread = await SupportThread.findById(threadId);
  if (!thread) throw AppError.notFound('Thread not found');
  if (String(thread.customerId) !== String(user.id)) throw AppError.forbidden('Not your thread');
  return thread;
}

export async function listMyThreads(user: AuthUser) {
  return SupportThread.find({ customerId: user.id }).sort({ lastMessageAt: -1 }).limit(50).lean();
}

const MAX_TOOL_ITERS = 4; // cost + infinite-loop guard

type ToolAction = { action: string; targetId: string };
type Outcome = { text: string; escalate: boolean; toolActions: ToolAction[] };

/**
 * The bot turn. Runs the model's tool-calling loop (OpenAI) or the one-shot stub — every tool
 * call goes through the guarded registry, so the bot can only ever exercise the customer's own
 * capabilities. Any tool that signals `escalate` (incl. escalate_to_support) hands off to a human.
 */
async function orchestrate(
  ctx: ToolContext,
  stored: { role: string; text: string }[],
  contextPrefix = '',
): Promise<Outcome> {
  const history: ChatTurn[] = toTurns(stored);
  // Fold the selected order/product context into the latest user turn (bot sees it; the
  // stored transcript stays clean for display).
  if (contextPrefix && history.length && history[history.length - 1]!.role === 'user') {
    history[history.length - 1]!.content = contextPrefix + history[history.length - 1]!.content;
  }
  const tools = toolSpecs(ctx.config);
  const toolActions: ToolAction[] = [];

  for (let i = 0; i < MAX_TOOL_ITERS; i++) {
    const res = await aiProvider.chat({ system: SUPPORT_SYSTEM_PROMPT, messages: history, tools });
    if (res.escalate) return { text: '', escalate: true, toolActions }; // stub / provider signal
    if (!res.toolCalls.length) return { text: res.text, escalate: false, toolActions };

    history.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls });
    for (const call of res.toolCalls) {
      if (call.name === 'escalate_to_support') return { text: '', escalate: true, toolActions };
      const result = await runTool(call.name, ctx, call.args);
      if (result.action) toolActions.push({ action: result.action, targetId: String(call.args.orderId ?? '') });
      if (result.escalate) return { text: '', escalate: true, toolActions };
      history.push({ role: 'tool', name: call.name, toolCallId: call.id, content: JSON.stringify(result) });
    }
  }
  return { text: '', escalate: true, toolActions }; // exhausted iterations → safest to hand off
}

/** A customer message → one bot turn. May resolve in-line (Tier 1) or open a ticket (Tier 2). */
export async function postCustomerMessage(
  user: AuthUser,
  threadId: string,
  text: string,
  context?: { orderId?: string; productTitle?: string },
) {
  const config = await getSupportConfig();
  const thread = await getMyThread(user, threadId);

  // Attach the customer's selected order/product context — ownership-checked, so a spoofed
  // orderId is simply ignored. Sets thread.orderId so the escalated ticket carries it too.
  let contextPrefix = '';
  if (context?.orderId && /^[a-f0-9]{24}$/i.test(context.orderId)) {
    const o = await Order.findOne({ _id: context.orderId, customerId: user.id }).select('orderNumber').lean();
    if (o) {
      thread.orderId = context.orderId as never;
      contextPrefix += `[Regarding order ${o.orderNumber}] `;
    }
  }
  if (context?.productTitle) contextPrefix += `[Regarding product "${context.productTitle.slice(0, 120)}"] `;

  thread.messages.push({ role: 'customer', text } as never);
  thread.lastMessageAt = new Date();

  // Master kill-switch: bot off → every message goes straight to a human.
  const outcome: Outcome =
    config.botEnabled === false
      ? { text: '', escalate: true, toolActions: [] }
      : await orchestrate({ user, config }, thread.messages as unknown as { role: string; text: string }[], contextPrefix);

  // Audit every state-changing action the bot took on the customer's behalf.
  for (const a of outcome.toolActions) {
    writeAudit(user.id, a.action, { targetType: 'order', targetId: a.targetId, meta: { via: 'support_bot' } });
  }

  if (outcome.escalate) {
    const ticket = await escalate(user, thread, config);
    const botText = config.handoffMessage;
    thread.messages.push({ role: 'bot', text: botText } as never);
    thread.status = 'pending_admin';
    thread.ticketId = ticket._id as never;
    await thread.save();
    emitMessage({ _id: thread._id, customerId: user.id }, 'bot', botText);
    return { thread, reply: botText, escalated: true, ticketId: String(ticket._id) };
  }

  const reply = outcome.text || config.handoffMessage;
  thread.messages.push({ role: 'bot', text: reply } as never);
  await thread.save();
  emitMessage({ _id: thread._id, customerId: user.id }, 'bot', reply);
  return { thread, reply, escalated: false };
}

/** Open (or reuse) a ticket for this thread with intent/sentiment/urgency + a suggested draft. */
async function escalate(
  user: AuthUser,
  thread: { _id: unknown; storeId?: unknown; orderId?: unknown; ticketId?: unknown; messages: { role: string; text: string }[] },
  config: SupportConfigDoc,
) {
  const cls = await aiProvider.classify(transcript(thread.messages));
  const lastMsg = lastCustomerText(thread.messages);
  const summary = `${cls.intent.replace(/_/g, ' ')}: "${lastMsg.slice(0, 80)}"`;
  const suggestedReply = DRAFTS[cls.intent] ?? DRAFTS.other;
  const slaDueAt = new Date(Date.now() + (config.slaMinutes ?? 120) * 60_000);

  // Reuse an existing live ticket on this thread, else create one.
  let ticket = thread.ticketId ? await SupportTicket.findById(thread.ticketId) : null;
  if (ticket && (ticket.status === 'resolved' || ticket.status === 'closed')) ticket = null;

  if (ticket) {
    ticket.intent = cls.intent;
    ticket.sentiment = cls.sentiment;
    ticket.urgency = cls.urgency;
    ticket.summary = summary;
    ticket.suggestedReply = suggestedReply;
    ticket.suggestedConfidence = cls.confidence;
    ticket.status = 'open';
    await ticket.save();
  } else {
    ticket = await SupportTicket.create({
      threadId: thread._id,
      customerId: user.id,
      storeId: thread.storeId,
      orderId: thread.orderId,
      intent: cls.intent,
      sentiment: cls.sentiment,
      urgency: cls.urgency,
      summary,
      suggestedReply,
      suggestedConfidence: cls.confidence,
      status: 'open',
      slaDueAt,
    });
  }

  const payload = {
    ticketId: String(ticket._id),
    threadId: String(thread._id),
    intent: cls.intent,
    sentiment: cls.sentiment,
    urgency: cls.urgency,
    summary,
    storeId: thread.storeId ? String(thread.storeId) : undefined,
    at: new Date().toISOString(),
  };
  safeEmit(() => emitToAdmin(SOCKET_EVENTS.SUPPORT_TICKET_NEW, payload));
  if (thread.storeId) safeEmit(() => emitToStore(String(thread.storeId), SOCKET_EVENTS.SUPPORT_TICKET_NEW, payload));
  return ticket;
}

// ── admin / vendor inbox ─────────────────────────────────────────────────────
export async function listTickets(
  user: AuthUser,
  q: { status?: string; intent?: string; sentiment?: string; storeId?: string; limit?: number },
) {
  const filter: Record<string, unknown> = {};
  if (isVendor(user)) filter.storeId = user.storeId; // store-scoped
  else if (q.storeId) filter.storeId = q.storeId; // admin may filter by store
  if (q.status) filter.status = q.status;
  if (q.intent) filter.intent = q.intent;
  if (q.sentiment) filter.sentiment = q.sentiment;
  return SupportTicket.find(filter)
    .sort({ urgency: -1, updatedAt: -1 })
    .limit(Math.min(q.limit ?? 100, 200))
    .lean();
}

export async function getTicket(user: AuthUser, ticketId: string) {
  const ticket = await SupportTicket.findById(ticketId).lean();
  if (!ticket) throw AppError.notFound('Ticket not found');
  assertTicketAccess(user, ticket as LeanTicket);
  const thread = await SupportThread.findById(ticket.threadId).lean();
  return { ticket, thread };
}

/** Manual reply: an agent's message goes to the customer; ticket moves to in_progress. */
export async function replyToTicket(user: AuthUser, ticketId: string, text: string) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw AppError.notFound('Ticket not found');
  assertTicketAccess(user, ticket as LeanTicket);
  const thread = await SupportThread.findById(ticket.threadId);
  if (!thread) throw AppError.notFound('Thread not found');

  thread.messages.push({ role: 'agent', text, agentId: user.id, meta: { sentBy: 'manual' } } as never);
  thread.status = 'open';
  thread.lastMessageAt = new Date();
  await thread.save();

  ticket.status = 'in_progress';
  await ticket.save();
  writeAudit(user.id, 'support:reply', { targetType: 'ticket', targetId: String(ticket._id), meta: { sentBy: 'manual' } });

  emitMessage(thread, 'agent', text);
  emitTicketUpdated(user, ticket);
  return { ticket, thread };
}

/** Regenerate the AI draft for a ticket (edit-then-send workflow). */
export async function regenerateSuggestion(user: AuthUser, ticketId: string) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw AppError.notFound('Ticket not found');
  assertTicketAccess(user, ticket as LeanTicket);
  const thread = await SupportThread.findById(ticket.threadId).lean();
  const cls = await aiProvider.classify(transcript(thread?.messages ?? []));
  ticket.suggestedReply = DRAFTS[cls.intent] ?? DRAFTS.other;
  ticket.suggestedConfidence = cls.confidence;
  await ticket.save();
  return ticket;
}

export async function updateTicket(
  user: AuthUser,
  ticketId: string,
  patch: { assigneeId?: string; status?: 'open' | 'in_progress' | 'resolved' | 'closed'; resolution?: string },
) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw AppError.notFound('Ticket not found');
  assertTicketAccess(user, ticket as LeanTicket);
  if (patch.assigneeId !== undefined) ticket.assigneeId = patch.assigneeId as never;
  if (patch.resolution !== undefined) ticket.resolution = patch.resolution;
  if (patch.status) {
    ticket.status = patch.status;
    if (patch.status === 'resolved' || patch.status === 'closed') {
      await SupportThread.findByIdAndUpdate(ticket.threadId, { status: patch.status });
    }
  }
  await ticket.save();
  writeAudit(user.id, 'support:ticket_update', { targetType: 'ticket', targetId: String(ticket._id), meta: patch });
  emitTicketUpdated(user, ticket);
  return ticket;
}

// ── socket emits ─────────────────────────────────────────────────────────────
function emitMessage(thread: { _id: unknown; customerId?: unknown; riderId?: unknown }, role: 'bot' | 'agent', text: string) {
  const payload = { threadId: String(thread._id), role, text, at: new Date().toISOString() };
  if (thread.riderId) safeEmit(() => emitToRider(String(thread.riderId), SOCKET_EVENTS.SUPPORT_MESSAGE, payload));
  else if (thread.customerId) safeEmit(() => emitToUser(String(thread.customerId), SOCKET_EVENTS.SUPPORT_MESSAGE, payload));
}
function emitTicketUpdated(user: AuthUser, ticket: { _id: unknown; status: string; storeId?: unknown }) {
  const payload = { ticketId: String(ticket._id), status: ticket.status as never, at: new Date().toISOString() };
  safeEmit(() => emitToAdmin(SOCKET_EVENTS.SUPPORT_TICKET_UPDATED, payload));
  if (ticket.storeId) safeEmit(() => emitToStore(String(ticket.storeId), SOCKET_EVENTS.SUPPORT_TICKET_UPDATED, payload));
}
