import { SOCKET_EVENTS } from '@app/shared';
import { AppError } from '../../common/AppError.js';
import { ledgerService } from '../ledger/ledger.service.js';
import { getSettings } from '../settings/settings.model.js';
import { Store } from '../stores/store.model.js';
import { Payout } from './payout.model.js';
import { emitToStore, safeEmit } from '../../realtime/emitters.js';
import { notify } from '../notifications/notifications.module.js';

export interface ReleaseInput {
  storeId: string;
  /** Partial payout; omit to release the whole available balance. */
  amount?: number;
  /** Bank UTR / UPI reference of the transfer you just made. */
  reference?: string;
  note?: string;
  actorId?: string;
}

export const payoutsService = {
  wallet(storeId: string) {
    return ledgerService.wallet(storeId);
  },

  /** The vendor's own statement — every line behind their balance. */
  async statement(storeId: string, limit = 100) {
    const [wallet, entries, settings] = await Promise.all([
      ledgerService.wallet(storeId),
      ledgerService.entriesForStore(storeId, limit),
      getSettings(),
    ]);
    return {
      ...wallet,
      holdDays: settings.payoutHoldDays,
      entries: entries.map((e) => ({
        at: e.at,
        account: e.account,
        amount: e.amount,
        availableAt: e.availableAt ?? null,
        note: e.note ?? null,
        refType: e.refType ?? null,
        refId: e.refId ?? null,
        orderId: e.orderId ? String(e.orderId) : null,
      })),
    };
  },

  /** Admin finance view: every store's balance, name and where to pay it. */
  async balances() {
    const [balances, settings] = await Promise.all([ledgerService.allBalances(), getSettings()]);
    const stores = await Store.find({ _id: { $in: balances.map((b) => b.storeId) } })
      .select('name slug bankAccount')
      .lean();
    const byId = new Map(stores.map((s) => [String(s._id), s]));
    return balances
      .map((b) => {
        const store = byId.get(b.storeId);
        const bank = store?.bankAccount;
        return {
          ...b,
          storeName: store?.name ?? b.storeId,
          holdDays: settings.payoutHoldDays,
          /** Enough detail for the admin to make the transfer, never the full account number. */
          payTo: bank?.accountNumber
            ? {
                accountName: bank.accountName ?? '',
                accountNumberMasked: maskAccount(bank.accountNumber),
                ifsc: bank.ifsc ?? '',
                upiId: bank.upiId ?? '',
                verified: bank.verified ?? false,
              }
            : bank?.upiId
              ? { accountName: bank.accountName ?? '', accountNumberMasked: '', ifsc: '', upiId: bank.upiId, verified: bank.verified ?? false }
              : null,
        };
      })
      .sort((a, b) => b.available - a.available);
  },

  async history(storeId?: string) {
    return Payout.find(storeId ? { storeId } : {}).sort({ createdAt: -1 }).limit(200).lean();
  },

  /**
   * Settle a vendor: record the payout + write the `vendor_paid` ledger entry.
   *
   * The transfer itself is made by the admin out-of-band (bank/UPI) and its UTR is
   * recorded here — that is what "manual" means. The ledger key is derived from the
   * payout id, so re-posting the same payout can never double-debit.
   */
  async release(input: ReleaseInput) {
    const wallet = await ledgerService.wallet(input.storeId);
    if (wallet.available <= 0)
      throw AppError.badRequest(
        'NO_BALANCE',
        wallet.pending > 0
          ? `Nothing released yet — ₹${wallet.pending / 100} is still inside the payout hold window.`
          : 'No balance to pay out',
      );

    const amount = input.amount ?? wallet.available;
    if (amount <= 0) throw AppError.badRequest('BAD_AMOUNT', 'Payout amount must be greater than zero');
    if (amount > wallet.available)
      throw AppError.badRequest('AMOUNT_TOO_LARGE', `Only ₹${wallet.available / 100} is available to release`);

    const store = await Store.findById(input.storeId).select('name bankAccount').lean();
    if (!store) throw AppError.notFound('Store not found');

    const bank = store.bankAccount;
    const payout = await Payout.create({
      storeId: input.storeId,
      amount,
      status: 'paid',
      method: 'manual',
      reference: input.reference,
      note: input.note,
      payTo: bank
        ? { accountName: bank.accountName, accountNumber: bank.accountNumber, ifsc: bank.ifsc, upiId: bank.upiId }
        : undefined,
      periodEnd: new Date(),
      createdBy: input.actorId,
    });

    await ledgerService.post([
      {
        storeId: input.storeId,
        account: 'vendor_paid',
        amount,
        availableAt: new Date(),
        idempotencyKey: `payout:${String(payout._id)}`,
        refType: 'payout',
        refId: input.reference ?? String(payout._id),
        note: input.note,
      },
    ]);

    const at = new Date().toISOString();
    safeEmit(() =>
      emitToStore(input.storeId, SOCKET_EVENTS.NOTIFICATION_NEW, {
        id: String(payout._id),
        title: 'Payout sent 🏦',
        body: `₹${amount / 100} released${input.reference ? ` · ref ${input.reference}` : ''}`,
        at,
      }),
    );
    const owner = await Store.findById(input.storeId).select('ownerId').lean();
    if (owner?.ownerId)
      void notify(String(owner.ownerId), {
        type: 'payment',
        title: 'Payout sent 🏦',
        body: `₹${amount / 100} has been released to your account${input.reference ? ` (ref ${input.reference})` : ''}`,
        link: '/wallet',
      });

    return payout;
  },
};

/** Never echo a full account number back to a screen. */
function maskAccount(acc: string): string {
  return acc.length <= 4 ? acc : `${'•'.repeat(Math.max(0, acc.length - 4))}${acc.slice(-4)}`;
}
