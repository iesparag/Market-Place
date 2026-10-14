import type { Request, Response } from 'express';
import { z } from 'zod';
import { Role } from '@app/shared';
import { ok } from '../../common/apiResponse.js';
import { deliveryTasksService } from './delivery-tasks.service.js';

const AssignSchema = z.object({ riderId: z.string().min(1) });
const StatusSchema = z.object({
  status: z.enum(['accepted', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled']),
});

export const deliveryTasksController = {
  /** Scope: vendor → their store's tasks; admin/super → all (optionally filtered). */
  async list(req: Request, res: Response) {
    const user = req.user!;
    if ((user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF) && user.storeId)
      return void ok(res, await deliveryTasksService.listForStore(user.storeId));
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const unassigned = req.query.unassigned === '1';
    ok(res, await deliveryTasksService.listForAdmin({ status, unassigned }));
  },

  async get(req: Request, res: Response) {
    ok(res, await deliveryTasksService.getById(req.params.id!));
  },

  async assign(req: Request, res: Response) {
    const { riderId } = AssignSchema.parse(req.body);
    const user = req.user!;
    ok(res, await deliveryTasksService.assign(req.params.id!, riderId, { role: user.role, storeId: user.storeId }));
  },

  async unassign(req: Request, res: Response) {
    const user = req.user!;
    ok(res, await deliveryTasksService.unassign(req.params.id!, { role: user.role, storeId: user.storeId }));
  },

  async updateStatus(req: Request, res: Response) {
    const { status } = StatusSchema.parse(req.body);
    const user = req.user!;
    ok(
      res,
      await deliveryTasksService.updateStatus(req.params.id!, status, {
        kind: 'user',
        role: user.role,
        storeId: user.storeId,
      }),
    );
  },
};
