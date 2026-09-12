import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Permission } from '@app/shared';
import { WILDCARD_PERMISSION } from '@app/shared';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { storesService } from './stores.service.js';
import { writeAudit } from '../audit/audit.module.js';

const CreateStoreSchema = z.object({
  name: z.string().min(2),
  vendorType: z.enum(['food', 'grocery', 'fashion', 'generic', 'integration']).optional(),
  description: z.string().optional(),
});

/**
 * Where payouts are sent. Validated at the edge because a typo here means real
 * money lands in the wrong account. `verified` is deliberately absent — only an
 * admin can set it, via the dedicated endpoint.
 */
const BankAccountSchema = z.object({
  accountName: z.string().max(120).optional(),
  accountNumber: z
    .string()
    .regex(/^[0-9]{6,20}$/, 'Account number must be 6–20 digits')
    .optional()
    .or(z.literal('')),
  ifsc: z
    .string()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC looks wrong (e.g. HDFC0001234)')
    .optional()
    .or(z.literal('')),
  upiId: z
    .string()
    .regex(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, 'UPI ID looks wrong (e.g. name@upi)')
    .optional()
    .or(z.literal('')),
});

const UpdateStoreSchema = z
  .object({ bankAccount: BankAccountSchema.optional() })
  .passthrough(); // other profile fields are allow-listed in the service

export const storesController = {
  async list(req: Request, res: Response) {
    const status = req.query.status as string | undefined;
    ok(res, await storesService.list(status ? { status } : {}));
  },
  async mine(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthenticated();
    ok(res, await storesService.myStore(req.user.id));
  },
  async getOne(req: Request, res: Response) {
    ok(res, await storesService.getById(req.params.id!));
  },
  async updateProfile(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthenticated();
    const fields = UpdateStoreSchema.parse(req.body);
    ok(res, await storesService.updateProfile({ id: req.user.id, role: req.user.role }, req.params.id!, fields));
  },

  /** Admin confirms the payout account matches the KYC documents. */
  async verifyBank(req: Request, res: Response) {
    const verified = z.boolean().parse(req.body.verified);
    const store = await storesService.setBankVerified(req.params.id!, verified);
    writeAudit(req.user?.id, 'store:bank_verify', {
      targetType: 'store',
      targetId: req.params.id,
      meta: { verified },
    });
    ok(res, store);
  },
  async create(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthenticated();
    const input = CreateStoreSchema.parse(req.body);
    created(res, await storesService.create(req.user.id, input));
  },
  async approve(req: Request, res: Response) {
    const store = await storesService.setStatus(req.params.id!, 'approved');
    writeAudit(req.user?.id, 'store:approve', { targetType: 'store', targetId: req.params.id });
    ok(res, store);
  },
  /** Suspending is a distinct permission from approving — a role can have one without the other. */
  async setStatus(req: Request, res: Response) {
    const status = z.enum(['approved', 'rejected', 'suspended']).parse(req.body.status);
    const required: Permission = status === 'suspended' ? 'store:suspend' : 'store:approve';
    const perms = req.user?.permissions ?? [];
    if (!perms.includes(WILDCARD_PERMISSION) && !perms.includes(required))
      throw AppError.forbidden(`Missing permission: ${required}`);

    const store = await storesService.setStatus(req.params.id!, status);
    writeAudit(req.user?.id, `store:${status}`, { targetType: 'store', targetId: req.params.id });
    ok(res, store);
  },

  /** Hard delete — only ever reaches the service for a store with zero order history. */
  async remove(req: Request, res: Response) {
    const result = await storesService.remove(req.params.id!);
    writeAudit(req.user?.id, 'store:delete', { targetType: 'store', targetId: req.params.id, meta: result });
    ok(res, result);
  },
};
