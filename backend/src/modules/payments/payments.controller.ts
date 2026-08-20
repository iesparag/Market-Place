import type { Request, Response } from 'express';
import { z } from 'zod';
import { Role } from '@app/shared';
import { ok } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { writeAudit } from '../audit/audit.module.js';
import { getSettings } from '../settings/settings.model.js';
import { paymentProvider } from '../../providers/payment/index.js';
import { Payment } from './payment.model.js';
import { PaymentEvent } from './payment-event.model.js';
import { paymentsService } from './payments.service.js';

const CheckoutSchema = z.object({
  orderId: z.string().min(1),
  method: z.enum(['razorpay', 'cod', 'mock']).default('razorpay'),
});

const ConfirmSchema = z.object({
  providerOrderId: z.string().min(1),
  providerPaymentId: z.string().min(1),
  signature: z.string().min(1),
});

const RefundSchema = z.object({
  amount: z.number().int().positive().optional(), // omit = refund everything left
  reason: z.string().max(500).optional(),
});

const ListSchema = z.object({
  status: z.enum(['created', 'attempted', 'paid', 'failed', 'refunded', 'partially_refunded']).optional(),
  method: z.enum(['razorpay', 'cod', 'mock']).optional(),
  q: z.string().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const paymentsController = {
  /** Which payment methods the storefront should offer. Public — the cart needs it. */
  async methods(_req: Request, res: Response) {
    const settings = await getSettings();
    ok(res, {
      provider: paymentProvider.name,
      live: paymentProvider.live,
      publicKey: paymentProvider.publicKey,
      currency: 'INR',
      methods: [
        {
          id: 'razorpay',
          label: 'UPI / Card / Netbanking',
          description: 'Pay securely with GPay, PhonePe, Paytm, any UPI app, card or netbanking',
          enabled: settings.onlinePaymentEnabled !== false,
        },
        {
          id: 'cod',
          label: 'Cash on delivery',
          description:
            settings.codMaxOrderValue > 0
              ? `Pay when it arrives · up to ₹${settings.codMaxOrderValue / 100}`
              : 'Pay when it arrives',
          enabled: settings.codEnabled !== false,
          maxOrderValue: settings.codMaxOrderValue,
        },
      ],
    });
  },

  /** Start (or resume) a payment for an order. */
  async checkout(req: Request, res: Response) {
    const input = CheckoutSchema.parse(req.body);
    ok(res, await paymentsService.createCheckout(input.orderId, req.user!.id, input.method));
  },

  /** Client SDK handshake after the sheet reports success. */
  async confirm(req: Request, res: Response) {
    const input = ConfirmSchema.parse(req.body);
    const payment = await paymentsService.confirmFromClient(req.user!.id, input);
    ok(res, await paymentsService.statusForOrder(String(payment?.orderId), req.user!.id));
  },

  /** Customer polls this while an async method (UPI collect) settles. */
  async status(req: Request, res: Response) {
    const user = req.user!;
    const isStaff = user.role !== Role.CUSTOMER;
    ok(res, await paymentsService.statusForOrder(req.params.id!, isStaff ? undefined : user.id));
  },

  /** Dev-only shortcut when no gateway keys are configured. */
  async mockPay(req: Request, res: Response) {
    const providerOrderId = z.string().min(1).parse(req.body.providerOrderId);
    const handshake = await paymentsService.mockPay(req.user!.id, providerOrderId);
    const payment = await paymentsService.confirmFromClient(req.user!.id, handshake);
    ok(res, await paymentsService.statusForOrder(String(payment?.orderId), req.user!.id));
  },

  /** Admin/finance: paged payment list with search + filters. */
  async list(req: Request, res: Response) {
    const q = ListSchema.parse(req.query);
    const user = req.user!;
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.method) filter.method = q.method;
    if (q.q) filter.$or = [{ orderNumber: new RegExp(escapeRegex(q.q), 'i') }, { providerPaymentId: q.q }, { providerOrderId: q.q }];
    if (q.from || q.to) {
      filter.createdAt = {
        ...(q.from ? { $gte: new Date(q.from) } : {}),
        ...(q.to ? { $lte: new Date(q.to) } : {}),
      };
    }
    // Vendors only ever see payments that funded one of their sub-orders.
    if ((user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF) && user.storeId)
      filter.storeIds = user.storeId;

    const [items, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      Payment.countDocuments(filter),
    ]);
    ok(res, items, { page: q.page, limit: q.limit, total });
  },

  async get(req: Request, res: Response) {
    const payment = await Payment.findById(req.params.id).lean();
    if (!payment) throw AppError.notFound('Payment not found');
    const user = req.user!;
    if ((user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF) && user.storeId) {
      const mine = (payment.storeIds ?? []).some((s) => String(s) === user.storeId);
      if (!mine) throw AppError.forbidden('Not your payment');
    }
    ok(res, payment);
  },

  /** Refund a paid order — full by default, partial with `amount`. */
  async refund(req: Request, res: Response) {
    const input = RefundSchema.parse(req.body);
    const result = await paymentsService.refund(req.params.id!, { ...input, actorId: req.user!.id });
    writeAudit(req.user!.id, 'order:refund', {
      targetType: 'order',
      targetId: req.params.id,
      meta: { amount: result.amount, refundId: result.refundId, reason: input.reason },
    });
    ok(res, result);
  },

  /**
   * Reconciliation: our ledger vs what the gateway actually captured, plus any
   * webhook that failed to process. This is the "does the money add up" screen.
   */
  async reconcile(req: Request, res: Response) {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 7 * 86_400_000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();

    const [totals, stuck, failedEvents] = await Promise.all([
      Payment.aggregate<{ _id: string; count: number; amount: number; refunded: number }>([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            amount: { $sum: '$amountPaid' },
            refunded: { $sum: '$refundedAmount' },
          },
        },
      ]),
      // Captured at the gateway but never settled into an order — should always be empty.
      Payment.find({
        status: 'paid',
        createdAt: { $gte: from, $lte: to },
      })
        .populate<{ orderId: { status?: string; payment?: { status?: string } } }>('orderId', 'status payment.status')
        .lean()
        .then((rows) => rows.filter((r) => r.orderId && r.orderId.payment?.status !== 'paid')),
      PaymentEvent.find({ status: 'error', createdAt: { $gte: from, $lte: to } })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    ok(res, {
      range: { from, to },
      provider: paymentProvider.name,
      byStatus: totals,
      unsettledPayments: stuck.map((p) => ({
        paymentId: String(p._id),
        orderNumber: p.orderNumber,
        amount: p.amountPaid,
        providerPaymentId: p.providerPaymentId,
      })),
      failedWebhooks: failedEvents.map((e) => ({
        eventId: e.eventId,
        type: e.type,
        error: e.error,
        at: e.createdAt,
      })),
    });
  },

  /** Replay a webhook that errored (after the underlying bug is fixed). */
  async replayEvent(req: Request, res: Response) {
    const event = await PaymentEvent.findById(req.params.id);
    if (!event) throw AppError.notFound('Event not found');
    if (event.status === 'processed') return void ok(res, { replayed: false, reason: 'already processed' });
    const entity = (event.payload as { payment?: { entity?: { id?: string } } } | null)?.payment?.entity;
    if (!entity?.id) throw AppError.badRequest('NO_PAYMENT', 'Event carries no payment to replay');

    const gatewayPayment = await paymentProvider.fetchPayment(entity.id);
    await paymentsService.applyGatewayPayment(gatewayPayment, 'webhook');
    await PaymentEvent.updateOne({ _id: event._id }, { $set: { status: 'processed', processedAt: new Date(), error: null } });
    writeAudit(req.user!.id, 'payment:replay', { targetType: 'paymentEvent', targetId: String(event._id) });
    ok(res, { replayed: true });
  },
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
