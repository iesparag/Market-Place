import { Types } from 'mongoose';
import { Ledger } from './ledger.model.js';

export interface LedgerEntryInput {
  orderId?: string;
  storeId?: string;
  account: 'vendor_payable' | 'vendor_paid' | 'commission_income' | 'platform_cash' | 'refund';
  amount: number;
  idempotencyKey?: string;
}

export const ledgerService = {
  /** Post entries; duplicate idempotencyKey is ignored (safe on retry). */
  async post(entries: LedgerEntryInput[]) {
    try {
      await Ledger.insertMany(entries, { ordered: false });
    } catch (e: unknown) {
      // ignore duplicate-key (idempotent replays)
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  },

  /** Vendor wallet: available = payable − paid. */
  async wallet(storeId: string) {
    const rows = await Ledger.aggregate<{ _id: string; total: number }>([
      { $match: { storeId: toId(storeId) } },
      { $group: { _id: '$account', total: { $sum: '$amount' } } },
    ]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r.total]));
    const payable = by['vendor_payable'] ?? 0;
    const paid = by['vendor_paid'] ?? 0;
    return { available: payable - paid, lifetimeEarned: payable, lifetimePaid: paid };
  },

  /** All store balances (admin finance view). */
  async allBalances() {
    const rows = await Ledger.aggregate<{ _id: { storeId: string; account: string }; total: number }>([
      { $match: { account: { $in: ['vendor_payable', 'vendor_paid'] } } },
      { $group: { _id: { storeId: '$storeId', account: '$account' }, total: { $sum: '$amount' } } },
    ]);
    const map = new Map<string, { payable: number; paid: number }>();
    for (const r of rows) {
      const key = String(r._id.storeId);
      const cur = map.get(key) ?? { payable: 0, paid: 0 };
      if (r._id.account === 'vendor_payable') cur.payable += r.total;
      else cur.paid += r.total;
      map.set(key, cur);
    }
    return [...map.entries()].map(([storeId, v]) => ({
      storeId,
      available: v.payable - v.paid,
      lifetimeEarned: v.payable,
      lifetimePaid: v.paid,
    }));
  },

  /** Platform revenue (commission income). */
  async platformCommission() {
    const rows = await Ledger.aggregate<{ total: number }>([
      { $match: { account: 'commission_income' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return rows[0]?.total ?? 0;
  },
};

function toId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
