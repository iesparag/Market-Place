import { z } from 'zod';

export const Role = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  VENDOR: 'vendor',
  VENDOR_STAFF: 'vendor_staff',
  CUSTOMER: 'customer',
} as const;
export const RoleEnum = z.enum([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.VENDOR,
  Role.VENDOR_STAFF,
  Role.CUSTOMER,
]);
export type Role = z.infer<typeof RoleEnum>;

export const VendorType = {
  FOOD: 'food',
  GROCERY: 'grocery',
  FASHION: 'fashion',
  GENERIC: 'generic',
  INTEGRATION: 'integration',
} as const;
export const VendorTypeEnum = z.enum([
  VendorType.FOOD,
  VendorType.GROCERY,
  VendorType.FASHION,
  VendorType.GENERIC,
  VendorType.INTEGRATION,
]);
export type VendorType = z.infer<typeof VendorTypeEnum>;

export const OrderStatusEnum = z.enum([
  'pending',
  'paid',
  'partially_fulfilled',
  'fulfilled',
  'cancelled',
  'refunded',
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

export const SubOrderStatusEnum = z.enum([
  'pending',
  'accepted',
  'preparing',
  'ready',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]);
export type SubOrderStatus = z.infer<typeof SubOrderStatusEnum>;

export const PaymentStatusEnum = z.enum([
  'requires_payment',
  'processing',
  'succeeded',
  'failed',
  'refunded',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const CurrencyEnum = z.enum(['INR', 'USD', 'TZS']);
export type Currency = z.infer<typeof CurrencyEnum>;

export const AttributeTypeEnum = z.enum([
  'string',
  'number',
  'boolean',
  'enum',
  'multi-enum',
]);
export type AttributeType = z.infer<typeof AttributeTypeEnum>;

// ── AI customer support (see docs/10-SUPPORT-AI.md) ──────────────────────────
/** What the customer is trying to do — drives routing, SLAs and auto-reply gating. */
export const SupportIntentEnum = z.enum([
  'where_is_order',
  'return_or_refund',
  'cancel_order',
  'order_issue',
  'payment_issue',
  'product_question',
  'account',
  'general',
  'other',
]);
export type SupportIntent = z.infer<typeof SupportIntentEnum>;

/** Emotional read of the message — surfaced to the admin, never used to auto-refund. */
export const SentimentEnum = z.enum(['positive', 'neutral', 'negative', 'angry']);
export type Sentiment = z.infer<typeof SentimentEnum>;

/** bot = self-serve; pending_admin = escalated & waiting on a human. */
export const SupportThreadStatusEnum = z.enum(['bot', 'open', 'pending_admin', 'resolved', 'closed']);
export type SupportThreadStatus = z.infer<typeof SupportThreadStatusEnum>;

export const SupportTicketStatusEnum = z.enum(['open', 'in_progress', 'resolved', 'closed']);
export type SupportTicketStatus = z.infer<typeof SupportTicketStatusEnum>;

export const SupportChannelEnum = z.enum(['app', 'web', 'admin']);
export type SupportChannel = z.infer<typeof SupportChannelEnum>;

export const SupportSenderEnum = z.enum(['customer', 'bot', 'agent', 'system']);
export type SupportSender = z.infer<typeof SupportSenderEnum>;
