import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { LoyaltyEntry } from './loyalty.model.js';

/** Earn 1 point per ₹10 spent (itemsTotal is minor units: 1000 paise = ₹10). */
const EARN_DIVISOR_PAISE = 1000;
/** Redemption rate: 1 point = ₹0.10 (10 paise) off. */
const POINT_VALUE_PAISE = 10;
/** A customer can never zero out an order with points — caps redemption at 50% of itemsTotal. */
const MAX_REDEEM_SHARE = 0.5;

export const loyaltyRoutes = Router();
loyaltyRoutes.use(authenticate);

async function balanceFor(userId: string): Promise<number> {
  const rows = await LoyaltyEntry.aggregate<{ total: number }>([
    { $match: { userId: new Types.ObjectId(userId) } },
    { $group: { _id: null, total: { $sum: '$points' } } },
  ]);
  return rows[0]?.total ?? 0;
}

loyaltyRoutes.get(
  '/balance',
  asyncHandler(async (req, res) => {
    const points = await balanceFor(req.user!.id);
    ok(res, { points, valuePaise: points * POINT_VALUE_PAISE });
  }),
);

const PreviewSchema = z.object({ points: z.number().int().min(1), itemsTotal: z.number().int().positive() });

/** How much of the requested points can actually be redeemed against this subtotal. */
export function redeemableDiscount(points: number, balance: number, itemsTotal: number): { points: number; discount: number } {
  const capPoints = Math.floor((itemsTotal * MAX_REDEEM_SHARE) / POINT_VALUE_PAISE);
  const applied = Math.max(0, Math.min(points, balance, capPoints));
  return { points: applied, discount: applied * POINT_VALUE_PAISE };
}

/** Balance-aware preview — how many of the requested points can actually be spent right now. */
export async function previewRedeem(userId: string, points: number, itemsTotal: number) {
  const balance = await balanceFor(userId);
  return redeemableDiscount(points, balance, itemsTotal);
}

loyaltyRoutes.post(
  '/redeem-preview',
  asyncHandler(async (req, res) => {
    const { points, itemsTotal } = PreviewSchema.parse(req.body);
    ok(res, await previewRedeem(req.user!.id, points, itemsTotal));
  }),
);

/**
 * Credit points for a paid order. Called from settlement.service.ts for both prepaid
 * and COD-collected orders — "paid" is the only trustworthy signal that the money is
 * real (a merely-placed, unpaid order must never earn). No clawback on refund (treated
 * as an acceptable simplification, same spirit as how coupons aren't un-applied either).
 */
export async function creditLoyaltyPoints(order: {
  _id: unknown;
  customerId: unknown;
  amounts?: { itemsTotal?: number | null } | null;
}): Promise<void> {
  const points = Math.floor((order.amounts?.itemsTotal ?? 0) / EARN_DIVISOR_PAISE);
  if (points <= 0) return;
  await LoyaltyEntry.create({
    userId: order.customerId,
    orderId: order._id,
    type: 'earn',
    points,
    note: `Earned on order`,
    idempotencyKey: `loyalty:earn:${String(order._id)}`,
  }).catch((e: unknown) => {
    // Duplicate key = already credited (replayed settle) — not an error.
    if ((e as { code?: number })?.code !== 11000) throw e;
  });
}

/** Generic bonus credit (referral rewards, future promos) — same idempotent-insert
 * pattern as creditLoyaltyPoints, just not tied to an order's itemsTotal. */
export async function creditBonusPoints(userId: unknown, points: number, note: string, idempotencyKey: string): Promise<void> {
  if (points <= 0) return;
  await LoyaltyEntry.create({ userId, type: 'earn', points, note, idempotencyKey }).catch((e: unknown) => {
    if ((e as { code?: number })?.code !== 11000) throw e;
  });
}

/**
 * Debit points redeemed on a newly-created order. Re-checks the balance at debit time,
 * not just at preview time, so points spent since the preview (e.g. an order placed a
 * moment earlier) are accounted for. Not fully race-proof against two truly concurrent
 * orders from the same account — accepted as a low-likelihood, low-value edge case
 * rather than adding transaction overhead for it.
 */
export async function debitLoyaltyPoints(userId: string, points: number, orderId: unknown): Promise<void> {
  if (points <= 0) return;
  const balance = await balanceFor(userId);
  if (points > balance) throw AppError.badRequest('LOYALTY_INSUFFICIENT', 'Not enough loyalty points');
  await LoyaltyEntry.create({
    userId,
    orderId,
    type: 'redeem',
    points: -points,
    note: 'Redeemed at checkout',
    idempotencyKey: `loyalty:redeem:${String(orderId)}`,
  });
}
