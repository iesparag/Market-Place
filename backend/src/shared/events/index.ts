import { z } from 'zod';
import {
  OrderStatusEnum,
  SubOrderStatusEnum,
  SupportSenderEnum,
  SupportIntentEnum,
  SentimentEnum,
  SupportTicketStatusEnum,
} from '../enums/index.js';

/**
 * Socket.IO event contracts — single source of truth for realtime.
 * Server emits and client listeners share these names + payload types.
 * See docs/08-STRUCTURE.md (realtime architecture).
 */
export const SOCKET_EVENTS = {
  ORDER_STATUS_UPDATED: 'order:status_updated',
  SUBORDER_NEW: 'suborder:new',
  DELIVERY_LOCATION: 'delivery:location',
  INVENTORY_CHANGED: 'inventory:changed',
  NOTIFICATION_NEW: 'notification:new',
  CHAT_MESSAGE: 'chat:message',
  PRESENCE: 'presence:update',
  // AI customer support (docs/10-SUPPORT-AI.md)
  SUPPORT_MESSAGE: 'support:message', // a new turn in a support thread
  SUPPORT_TICKET_NEW: 'support:ticket_new', // escalation created → admin/store inbox
  SUPPORT_TICKET_UPDATED: 'support:ticket_updated', // status / assignee / reply
  SUPPORT_TYPING: 'support:typing', // bot/agent typing indicator
} as const;
export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export const OrderStatusUpdatedSchema = z.object({
  orderId: z.string(),
  subOrderId: z.string().optional(),
  status: OrderStatusEnum.or(SubOrderStatusEnum),
  at: z.string(),
});
export type OrderStatusUpdated = z.infer<typeof OrderStatusUpdatedSchema>;

export const SubOrderNewSchema = z.object({
  subOrderId: z.string(),
  storeId: z.string(),
  orderNumber: z.string(),
  itemsCount: z.number().int().positive(),
  at: z.string(),
});
export type SubOrderNew = z.infer<typeof SubOrderNewSchema>;

export const DeliveryLocationSchema = z.object({
  orderId: z.string(),
  lat: z.number(),
  lng: z.number(),
  at: z.string(),
});
export type DeliveryLocation = z.infer<typeof DeliveryLocationSchema>;

export const InventoryChangedSchema = z.object({
  productId: z.string(),
  variantSku: z.string(),
  stock: z.number().int().nonnegative(),
  at: z.string(),
});
export type InventoryChanged = z.infer<typeof InventoryChangedSchema>;

export const NotificationNewSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  at: z.string(),
});
export type NotificationNew = z.infer<typeof NotificationNewSchema>;

export const ChatMessageSchema = z.object({
  threadId: z.string(),
  from: z.string(),
  text: z.string(),
  at: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SupportMessageSchema = z.object({
  threadId: z.string(),
  role: SupportSenderEnum,
  text: z.string(),
  at: z.string(),
});
export type SupportMessage = z.infer<typeof SupportMessageSchema>;

export const SupportTicketNewSchema = z.object({
  ticketId: z.string(),
  threadId: z.string(),
  intent: SupportIntentEnum,
  sentiment: SentimentEnum,
  urgency: z.number().int().min(1).max(3),
  summary: z.string(),
  storeId: z.string().optional(),
  at: z.string(),
});
export type SupportTicketNew = z.infer<typeof SupportTicketNewSchema>;

export const SupportTicketUpdatedSchema = z.object({
  ticketId: z.string(),
  status: SupportTicketStatusEnum,
  at: z.string(),
});
export type SupportTicketUpdated = z.infer<typeof SupportTicketUpdatedSchema>;

export const SupportTypingSchema = z.object({
  threadId: z.string(),
  who: z.enum(['bot', 'agent']),
  at: z.string(),
});
export type SupportTyping = z.infer<typeof SupportTypingSchema>;

/** Payload type lookup by event name (compile-time safety for emit/listen). */
export interface SocketEventPayloads {
  [SOCKET_EVENTS.ORDER_STATUS_UPDATED]: OrderStatusUpdated;
  [SOCKET_EVENTS.SUBORDER_NEW]: SubOrderNew;
  [SOCKET_EVENTS.DELIVERY_LOCATION]: DeliveryLocation;
  [SOCKET_EVENTS.INVENTORY_CHANGED]: InventoryChanged;
  [SOCKET_EVENTS.NOTIFICATION_NEW]: NotificationNew;
  [SOCKET_EVENTS.CHAT_MESSAGE]: ChatMessage;
  [SOCKET_EVENTS.PRESENCE]: { userId: string; online: boolean };
  [SOCKET_EVENTS.SUPPORT_MESSAGE]: SupportMessage;
  [SOCKET_EVENTS.SUPPORT_TICKET_NEW]: SupportTicketNew;
  [SOCKET_EVENTS.SUPPORT_TICKET_UPDATED]: SupportTicketUpdated;
  [SOCKET_EVENTS.SUPPORT_TYPING]: SupportTyping;
}
