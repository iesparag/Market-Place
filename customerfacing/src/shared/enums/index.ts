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
