import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { User } from '../auth/user.model.js';
import { Order } from '../orders/order.model.js';
import { creditBonusPoints } from '../loyalty/loyalty.module.js';
import { getSettings } from '../settings/settings.model.js';
import { notify } from '../notifications/notifications.module.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to read aloud/type
function randomCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

/** Generates a code on first use rather than at signup — most users never share. */
async function getOrCreateReferralCode(userId: string): Promise<string> {
  const user = await User.findById(userId).select('referralCode').lean();
  if (user?.referralCode) return user.referralCode;
  // Retry on the rare collision rather than pre-checking uniqueness (the unique index
  // is the actual guarantee; a pre-check would just be a race-prone duplicate of it).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await User.updateOne({ _id: userId }, { $set: { referralCode: code } });
      return code;
    } catch (e: unknown) {
      if ((e as { code?: number })?.code !== 11000) throw e;
    }
  }
  throw new Error('Could not generate a unique referral code');
}

export const referralRoutes = Router();
referralRoutes.use(authenticate);

referralRoutes.get(
  '/me',
  asyncHandler(async (req, res) => {
    const [code, settings, referredCount, rewardedCount] = await Promise.all([
      getOrCreateReferralCode(req.user!.id),
      getSettings(),
      User.countDocuments({ referredBy: req.user!.id }),
      User.countDocuments({ referredBy: req.user!.id, referralRewarded: true }),
    ]);
    ok(res, {
      code,
      rewardPoints: settings.referralRewardPoints,
      rewardValuePaise: settings.referralRewardPoints * settings.loyaltyPointValuePaise,
      referredCount,
      rewardedCount,
    });
  }),
);

/**
 * Pays the referrer once their invite's FIRST paid order settles — called from
 * settlement.service.ts alongside creditLoyaltyPoints. Requires this to genuinely be
 * the referred user's first paid order (not just their first order ever, and not
 * re-triggered on every later order) so an invite only pays out once, for a real
 * purchase, not a signup alone.
 */
export async function rewardReferrerForFirstOrder(order: { _id: unknown; customerId: unknown }): Promise<void> {
  const settings = await getSettings();
  if (!settings.features.referralEnabled) return;
  const customer = await User.findById(order.customerId).select('referredBy referralRewarded').lean();
  if (!customer?.referredBy || customer.referralRewarded) return;

  const priorPaidOrders = await Order.countDocuments({
    customerId: order.customerId,
    _id: { $ne: order._id },
    status: { $in: ['paid', 'fulfilled'] },
  });
  if (priorPaidOrders > 0) return;

  // Atomic claim on referralRewarded — if settlePrepaid and a retry both reach here,
  // only one flips false → true and only one reward is ever credited.
  const claimed = await User.updateOne(
    { _id: order.customerId, referralRewarded: false },
    { $set: { referralRewarded: true } },
  );
  if (claimed.modifiedCount === 0) return;

  await creditBonusPoints(
    customer.referredBy,
    settings.referralRewardPoints,
    'Referral reward — your invite made their first purchase',
    `referral:${String(order.customerId)}`,
  );
  void notify(String(customer.referredBy), {
    type: 'promo',
    title: '🎉 Referral reward credited!',
    body: `Your invite made their first purchase — you earned ${settings.referralRewardPoints} loyalty points.`,
    link: '/refer',
  });
}
