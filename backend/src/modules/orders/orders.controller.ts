import type { Request, Response } from 'express';
import { z } from 'zod';
import { Role } from '@app/shared';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { ordersService } from './orders.service.js';
import { writeAudit } from '../audit/audit.module.js';

const CreateOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantSku: z.string().min(1),
        qty: z.number().int().min(1),
        modifierNames: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  couponCode: z.string().optional(),
  contact: z
    .object({ name: z.string().optional(), phone: z.string().optional(), email: z.string().optional() })
    .optional(),
  shippingAddress: z
    .object({ line1: z.string().optional(), city: z.string().optional(), pincode: z.string().optional() })
    .optional(),
});

export const ordersController = {
  async create(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthenticated();
    const input = CreateOrderSchema.parse(req.body);
    created(res, await ordersService.create(req.user.id, input));
  },

  /** Scope: customer → own; vendor → their store's; admin/super → all. */
  async list(req: Request, res: Response) {
    const user = req.user!;
    if (user.role === Role.CUSTOMER) return void ok(res, await ordersService.listByCustomer(user.id));
    if ((user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF) && user.storeId)
      return void ok(res, await ordersService.listByStore(user.storeId));
    ok(res, await ordersService.listAll());
  },

  async get(req: Request, res: Response) {
    ok(res, await ordersService.getById(req.params.id!));
  },

  async updateStatus(req: Request, res: Response) {
    const status = z.enum(['pending', 'paid', 'fulfilled', 'cancelled']).parse(req.body.status);
    const user = req.user!;
    ok(res, await ordersService.updateStatus(req.params.id!, status, { role: user.role, storeId: user.storeId }));
  },

  async resendStatus(req: Request, res: Response) {
    const user = req.user!;
    ok(res, await ordersService.resendStatus(req.params.id!, { role: user.role, storeId: user.storeId }));
  },

  async pay(req: Request, res: Response) {
    ok(res, await ordersService.pay(req.params.id!, req.user!.id));
  },

  async cancel(req: Request, res: Response) {
    ok(res, await ordersService.cancel(req.params.id!, req.user!.id));
  },

  async refund(req: Request, res: Response) {
    const user = req.user!;
    const order = await ordersService.refund(req.params.id!, { role: user.role, storeId: user.storeId });
    writeAudit(user.id, 'order:refund', { targetType: 'order', targetId: req.params.id });
    ok(res, order);
  },
};
