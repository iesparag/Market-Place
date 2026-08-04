import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * AI customer support — data model. See docs/10-SUPPORT-AI.md.
 *   SupportThread  : the chat transcript (customer ↔ bot ↔ agent).
 *   SupportTicket  : the escalation an admin/vendor acts on (intent + sentiment + AI draft).
 *   SupportConfig  : the singleton the admin uses to turn every feature on/off.
 * Money never moves here — a refund goes through the order/ledger flow under an admin actor.
 */

// ── Thread ───────────────────────────────────────────────────────────────────
const messageSchema = new Schema(
  {
    role: { type: String, enum: ['customer', 'bot', 'agent', 'system'], required: true },
    text: { type: String, required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User' }, // set when role === 'agent'
    meta: { type: Schema.Types.Mixed }, // toolCalls, confidence, sentBy:'auto', etc.
  },
  { _id: true, timestamps: true },
);

const threadSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', index: true }, // context if store-specific
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' }, // context if order-specific
    channel: { type: String, enum: ['app', 'web', 'admin'], default: 'web' },
    status: {
      type: String,
      enum: ['bot', 'open', 'pending_admin', 'resolved', 'closed'],
      default: 'bot',
      index: true,
    },
    subject: String,
    messages: { type: [messageSchema], default: [] },
    ticketId: { type: Schema.Types.ObjectId, ref: 'SupportTicket' },
    lastMessageAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);
export type SupportThreadDoc = InferSchemaType<typeof threadSchema>;
export const SupportThread = model('SupportThread', threadSchema);

// ── Ticket ───────────────────────────────────────────────────────────────────
const ticketSchema = new Schema(
  {
    threadId: { type: Schema.Types.ObjectId, ref: 'SupportThread', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', index: true }, // scopes vendor visibility
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    intent: { type: String, default: 'other', index: true },
    sentiment: { type: String, default: 'neutral' },
    urgency: { type: Number, min: 1, max: 3, default: 2 },
    summary: { type: String, default: '' }, // one-line AI TL;DR
    suggestedReply: { type: String, default: '' }, // AI draft (grounded, regenerable)
    suggestedConfidence: { type: Number, default: 0 }, // 0..1 → gates auto-send (S5)
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolution: String,
    slaDueAt: Date,
  },
  { timestamps: true },
);
export type SupportTicketDoc = InferSchemaType<typeof ticketSchema>;
export const SupportTicket = model('SupportTicket', ticketSchema);

// ── Config (admin controls everything) ───────────────────────────────────────
const supportConfigSchema = new Schema(
  {
    key: { type: String, default: 'support', unique: true },
    botEnabled: { type: Boolean, default: true }, // master kill-switch → all to human
    channels: {
      app: { type: Boolean, default: true }, // Flutter widget on/off
      web: { type: Boolean, default: true }, // customerfacing widget on/off
    },
    greeting: {
      type: String,
      default: 'Hi! I can help with your orders, deliveries and returns. What do you need?',
    },
    handoffMessage: {
      type: String,
      default: "I've passed this to our support team — someone will get back to you shortly.",
    },
    // Safe self-service capabilities — admin flips each one on/off.
    selfService: {
      trackOrder: { type: Boolean, default: true },
      viewInvoice: { type: Boolean, default: true },
      cancelUnshipped: { type: Boolean, default: true },
      reorder: { type: Boolean, default: true },
    },
    // Escalated-ticket reply behaviour (default manual; auto is opt-in — phase S5).
    autoReply: {
      enabled: { type: Boolean, default: false },
      minConfidence: { type: Number, default: 0.85 }, // only auto-send at/above this
      businessHoursOnly: { type: Boolean, default: false },
      byIntent: { type: Schema.Types.Mixed, default: {} }, // { where_is_order: true, ... }
    },
    slaMinutes: { type: Number, default: 120 },
    ratePerMin: { type: Number, default: 20 }, // per-user message rate limit
  },
  { timestamps: true },
);
export type SupportConfigDoc = InferSchemaType<typeof supportConfigSchema>;
export const SupportConfig = model('SupportConfig', supportConfigSchema);

/** The singleton config, created on first read (same pattern as Settings/AppConfig). */
export async function getSupportConfig() {
  return SupportConfig.findOneAndUpdate(
    { key: 'support' },
    { $setOnInsert: { key: 'support' } },
    { new: true, upsert: true },
  ).lean();
}

/** Trimmed config the customer surfaces read (no internal thresholds). */
export async function getSupportConfigPublic() {
  const c = await getSupportConfig();
  return {
    botEnabled: c.botEnabled,
    channels: c.channels,
    greeting: c.greeting,
  };
}
