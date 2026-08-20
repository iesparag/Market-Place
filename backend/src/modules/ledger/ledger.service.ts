import { Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import { Ledger } from './ledger.model.js';

export type LedgerAccount =
  | 'vendor_payable'
  | 'vendor_paid'
  | 'commission_income'
  | 'platform_cash'
  | 'refund';

export interface LedgerEntryInput {
  orderId?: string;
  storeId?: string;
  account: LedgerAccount;
  /** Minor units. Negative = reversal / clawback. */
  amount: number;
  /** When a vendor_payable credit becomes releasable (payout hold window). */
  availableAt?: Date;
  idempotencyKey?: string;
  refType?: string;
  refId?: string;
  note?: string;
}

export interface WalletBalance {
  /** Released from hold and not yet paid out — this is what a payout can take. */
  available: number;
  /** Earned but still inside the payout hold window. */
  pending: number;
  lifetimeEarned: number;
  lifetimePaid: number;
}

export const ledgerService = {
  /**
   * Post entries. Duplicate `idempotencyKey`s are silently dropped, so replaying a
   * webhook or retrying a settle can never double-post. Any other write error is
   * re-thrown — a genuinely failed ledger write must not pass silently.
   */
  async post(entries: LedgerEntryInput[]): Promise<void> {
    if (!entries.length) return;
    try {
      await Ledger.insertMany(entries, { ordered: false });
    } catch (e: unknown) {
      const err = e as { code?: number; writeErrors?: { err?: { code?: number }; code?: number }[] };
      const writeErrors = err.writeErrors ?? [];
      const allDuplicates =
        (writeErrors.length > 0 && writeErrors.every((w) => (w.err?.code ?? w.code) === 11000)) ||
        (writeErrors.length === 0 && err.code === 11000);
      if (!allDuplicates) throw e;
      logger.debug({ count: writeErrors.length }, 'ledger: ignored duplicate idempotent entries');
    }
  },

  /** Vendor wallet, hold-window aware. */
  async wallet(storeId: string, now = new Date()): Promise<WalletBalance> {
    const rows = await Ledger.aggregate<{ _id: { account: string; released: boolean }; total: number }>([
      { $match: { storeId: toId(storeId) } },
      {
        $group: {
          _id: {
            account: '$account',
            released: { $lte: [{ $ifNull: ['$availableAt', new Date(0)] }, now] },
          },
          total: { $sum: '$amount' },
        },
      },
    ]);

    let released = 0;
    let held = 0;
    let earned = 0;
    let paid = 0;
    for (const r of rows) {
      if (r._id.account === 'vendor_payable') {
        earned += r.total;
        if (r._id.released) released += r.total;
        else held += r.total;
      } else if (r._id.account === 'vendor_paid') {
        paid += r.total;
      }
    }
    return {
      available: released - paid,
      pending: held,
      lifetimeEarned: earned,
      lifetimePaid: paid,
    };
  },

  /** All store balances (admin finance view). */
  async allBalances(now = new Date()): Promise<(WalletBalance & { storeId: string })[]> {
    const rows = await Ledger.aggregate<{
      _id: { storeId: string; account: string; released: boolean };
      total: number;
    }>([
      { $match: { account: { $in: ['vendor_payable', 'vendor_paid'] }, storeId: { $ne: null } } },
      {
        $group: {
          _id: {
            storeId: '$storeId',
            account: '$account',
            released: { $lte: [{ $ifNull: ['$availableAt', new Date(0)] }, now] },
          },
          total: { $sum: '$amount' },
        },
      },
    ]);

    const map = new Map<string, { released: number; held: number; paid: number }>();
    for (const r of rows) {
      const key = String(r._id.storeId);
      const cur = map.get(key) ?? { released: 0, held: 0, paid: 0 };
      if (r._id.account === 'vendor_payable') {
        if (r._id.released) cur.released += r.total;
        else cur.held += r.total;
      } else {
        cur.paid += r.total;
      }
      map.set(key, cur);
    }
    return [...map.entries()].map(([storeId, v]) => ({
      storeId,
      available: v.released - v.paid,
      pending: v.held,
      lifetimeEarned: v.released + v.held,
      lifetimePaid: v.paid,
    }));
  },

  /** Platform revenue (commission income, net of refund clawbacks). */
  async platformCommission(): Promise<number> {
    const rows = await Ledger.aggregate<{ total: number }>([
      { $match: { account: 'commission_income' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return rows[0]?.total ?? 0;
  },

  /** Totals per account — the finance summary + reconciliation baseline. */
  async summary(range?: { from?: Date; to?: Date }): Promise<Record<LedgerAccount, number>> {
    const match: Record<string, unknown> = {};
    if (range?.from || range?.to) {
      match.at = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
    }
    const rows = await Ledger.aggregate<{ _id: string; total: number }>([
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      { $group: { _id: '$account', total: { $sum: '$amount' } } },
    ]);
    const out: Record<LedgerAccount, number> = {
      vendor_payable: 0,
      vendor_paid: 0,
      commission_income: 0,
      platform_cash: 0,
      refund: 0,
    };
    for (const r of rows) if (r._id in out) out[r._id as LedgerAccount] = r.total;
    return out;
  },

  /** Statement rows for a store (vendor's "why is my balance this number" view). */
  async entriesForStore(storeId: string, limit = 100) {
    return Ledger.find({ storeId }).sort({ at: -1 }).limit(limit).lean();
  },
};

function toId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
