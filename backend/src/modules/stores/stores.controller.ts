import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { storesService } from './stores.service.js';
import { writeAudit } from '../audit/audit.module.js';

const CreateStoreSchema = z.object({
  name: z.string().min(2),
  vendorType: z.enum(['food', 'grocery', 'fashion', 'generic', 'integration']).optional(),
  description: z.string().optional(),
});

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
    ok(res, await storesService.updateProfile({ id: req.user.id, role: req.user.role }, req.params.id!, req.body));
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
  async setStatus(req: Request, res: Response) {
    const status = z.enum(['approved', 'rejected', 'suspended']).parse(req.body.status);
    const store = await storesService.setStatus(req.params.id!, status);
    writeAudit(req.user?.id, `store:${status}`, { targetType: 'store', targetId: req.params.id });
    ok(res, store);
  },
};
