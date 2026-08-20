import type { Request, Response } from 'express';
import { z } from 'zod';
import { Role } from '@app/shared';
import { ok } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { payoutsService } from './payouts.service.js';
import { writeAudit } from '../audit/audit.module.js';

const ReleaseSchema = z.object({
  storeId: z.string().min(1),
  amount: z.number().int().positive().optional(),
  reference: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

export const payoutsController = {
  /** Vendor → own wallet; admin may pass ?storeId. */
  async wallet(req: Request, res: Response) {
    const user = req.user!;
    const storeId =
      user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF
        ? user.storeId
        : (req.query.storeId as string | undefined);
    if (!storeId) throw AppError.badRequest('NO_STORE', 'No store in scope');
    ok(res, await payoutsService.wallet(storeId));
  },

  async balances(_req: Request, res: Response) {
    ok(res, await payoutsService.balances());
  },

  async history(req: Request, res: Response) {
    const user = req.user!;
    const storeId =
      user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF ? user.storeId : undefined;
    ok(res, await payoutsService.history(storeId));
  },

  /** Vendor statement — every ledger line behind the balance. */
  async statement(req: Request, res: Response) {
    const user = req.user!;
    const storeId =
      user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF
        ? user.storeId
        : (req.query.storeId as string | undefined);
    if (!storeId) throw AppError.badRequest('NO_STORE', 'No store in scope');
    ok(res, await payoutsService.statement(storeId));
  },

  async release(req: Request, res: Response) {
    const input = ReleaseSchema.parse(req.body);
    const payout = await payoutsService.release({ ...input, actorId: req.user!.id });
    writeAudit(req.user?.id, 'payout:release', {
      targetType: 'store',
      targetId: input.storeId,
      meta: { amount: payout.amount, reference: input.reference },
    });
    ok(res, payout);
  },
};
