import { Router } from 'express';
import { Role } from '@app/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { Order } from '../orders/order.model.js';
import { Product } from '../products/product.model.js';
import { Store } from '../stores/store.model.js';
import { User } from '../auth/user.model.js';
import { ledgerService } from '../ledger/ledger.service.js';

export const analyticsRoutes = Router();

/** Platform (admin) or store (vendor) summary — powers the dashboard KPIs. */
analyticsRoutes.get(
  '/summary',
  authenticate,
  authorize('analytics:read'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const scoped = user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF;
    const orderFilter = scoped ? { storeIds: user.storeId } : {};

    const [orders, paid, productCount, storeCount, customerCount, statusAgg] = await Promise.all([
      Order.countDocuments(orderFilter),
      Order.find({ ...orderFilter, status: { $in: ['paid', 'fulfilled'] } })
        .select('amounts.grandTotal')
        .lean(),
      Product.countDocuments(scoped ? { storeId: user.storeId } : {}),
      scoped ? Promise.resolve(1) : Store.countDocuments({}),
      scoped ? Promise.resolve(0) : User.countDocuments({ role: Role.CUSTOMER }),
      Order.aggregate<{ _id: string; n: number }>([
        { $match: orderFilter },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
    ]);

    const revenue = paid.reduce((s, o) => s + (o.amounts?.grandTotal ?? 0), 0);
    const commission = scoped ? 0 : await ledgerService.platformCommission();
    const wallet = scoped && user.storeId ? await ledgerService.wallet(user.storeId) : null;

    ok(res, {
      orders,
      revenue,
      commission,
      productCount,
      storeCount,
      customerCount,
      ordersByStatus: Object.fromEntries(statusAgg.map((s) => [s._id, s.n])),
      wallet,
    });
  }),
);

/** Daily orders + revenue for the last N days — the Analytics page's trend chart. */
analyticsRoutes.get(
  '/timeseries',
  authenticate,
  authorize('analytics:read'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const scoped = user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF;
    const orderFilter = scoped ? { storeIds: user.storeId } : {};
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await Order.aggregate<{ _id: string; orders: number; revenue: number }>([
      { $match: { ...orderFilter, createdAt: { $gte: since }, status: { $in: ['paid', 'fulfilled'] } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$amounts.grandTotal' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    ok(res, rows.map((r) => ({ date: r._id, orders: r.orders, revenue: r.revenue })));
  }),
);
