import { AppError } from '../../common/AppError.js';
import { ledgerService } from '../ledger/ledger.service.js';
import { Store } from '../stores/store.model.js';
import { Payout } from './payout.model.js';
import { emitToStore, safeEmit } from '../../realtime/emitters.js';
import { SOCKET_EVENTS } from '@app/shared';

export const payoutsService = {
  wallet(storeId: string) {
    return ledgerService.wallet(storeId);
  },

  /** Admin finance view: every store's balance + name. */
  async balances() {
    const balances = await ledgerService.allBalances();
    const stores = await Store.find({ _id: { $in: balances.map((b) => b.storeId) } })
      .select('name slug')
      .lean();
    const nameMap = new Map(stores.map((s) => [String(s._id), s.name]));
    return balances.map((b) => ({ ...b, storeName: nameMap.get(b.storeId) ?? b.storeId }));
  },

  async history(storeId?: string) {
    return Payout.find(storeId ? { storeId } : {}).sort({ createdAt: -1 }).lean();
  },

  /** Release a store's available balance: record payout + write vendor_paid ledger entry. */
  async release(storeId: string) {
    const wallet = await ledgerService.wallet(storeId);
    if (wallet.available <= 0) throw AppError.badRequest('NO_BALANCE', 'No balance to pay out');

    const payout = await Payout.create({ storeId, amount: wallet.available, status: 'paid' });
    await ledgerService.post([
      {
        storeId,
        account: 'vendor_paid',
        amount: wallet.available,
        idempotencyKey: `payout:${payout._id}`,
      },
    ]);

    safeEmit(() =>
      emitToStore(storeId, SOCKET_EVENTS.NOTIFICATION_NEW, {
        id: String(payout._id),
        title: 'Payout sent 🏦',
        body: `₹${wallet.available / 100} released to your account`,
        at: new Date().toISOString(),
      }),
    );
    return payout;
  },
};
