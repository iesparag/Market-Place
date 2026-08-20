import type { Request, Response } from 'express';
import { logger } from '../../config/logger.js';
import { Payment } from './payment.model.js';
import { PaymentEvent } from './payment-event.model.js';
import { paymentsService } from './payments.service.js';
import {
  paymentProvider,
  PaymentProviderError,
  type ProviderPayment,
  type ProviderWebhookEvent,
} from '../../providers/payment/index.js';

/** Razorpay wraps entities as `payload.<entity>.entity`. */
interface RzpEntityPayload {
  payment?: { entity?: RawPaymentEntity };
  refund?: { entity?: RawRefundEntity };
  order?: { entity?: { id?: string } };
}
interface RawPaymentEntity {
  id: string;
  order_id?: string;
  status: string;
  amount: number;
  amount_refunded?: number;
  currency: string;
  method?: string;
  captured?: boolean;
  error_code?: string | null;
  error_description?: string | null;
}
interface RawRefundEntity {
  id: string;
  payment_id?: string;
  amount: number;
  status: string;
}

/**
 * Gateway → us. Mounted on the RAW body (before `express.json`) because the
 * signature is computed over the exact bytes the gateway sent.
 *
 * Contract with the gateway:
 *  - bad signature        → 400, never retried, nothing touched
 *  - already processed    → 200, no-op (duplicate delivery)
 *  - processing failed    → 500, so the gateway retries and we settle late rather than never
 *  - anything else        → 200
 */
export async function handlePaymentWebhook(req: Request, res: Response): Promise<void> {
  let event: ProviderWebhookEvent;
  try {
    event = paymentProvider.verifyWebhook(req.body as Buffer, req.headers as Record<string, string | undefined>);
  } catch (err) {
    const code = err instanceof PaymentProviderError ? err.providerCode : 'INVALID';
    logger.warn({ err, ip: req.ip }, 'webhook: rejected');
    res.status(400).json({ ok: false, error: { code, message: 'Invalid webhook' } });
    return;
  }

  const entities = event.payload as RzpEntityPayload;
  const paymentEntity = entities.payment?.entity;
  const refundEntity = entities.refund?.entity;

  // Claim the event. A duplicate delivery finds an existing row; if that row is
  // already `processed` we ack immediately without touching money again.
  const claim = await PaymentEvent.findOneAndUpdate(
    { provider: paymentProvider.name, eventId: event.id },
    {
      $setOnInsert: {
        provider: paymentProvider.name,
        eventId: event.id,
        type: event.type,
        status: 'received',
        providerOrderId: paymentEntity?.order_id ?? entities.order?.entity?.id,
        providerPaymentId: paymentEntity?.id ?? refundEntity?.payment_id,
        payload: event.payload,
      },
    },
    { new: true, upsert: true },
  );

  if (claim.status === 'processed' || claim.status === 'ignored') {
    logger.info({ eventId: event.id, type: event.type }, 'webhook: duplicate delivery — no-op');
    res.status(200).json({ ok: true, data: { duplicate: true } });
    return;
  }

  try {
    const handled = await processEvent(event.type, paymentEntity, refundEntity);
    await PaymentEvent.updateOne(
      { _id: claim._id },
      { $set: { status: handled ? 'processed' : 'ignored', processedAt: new Date(), error: null } },
    );
    res.status(200).json({ ok: true, data: { handled } });
  } catch (err) {
    logger.error({ err, eventId: event.id, type: event.type }, 'webhook: processing failed');
    await PaymentEvent.updateOne(
      { _id: claim._id },
      { $set: { status: 'error', error: String(err), processedAt: new Date() } },
    );
    // 5xx → the gateway retries; the event row stays non-`processed` so the retry re-runs.
    res.status(500).json({ ok: false, error: { code: 'WEBHOOK_FAILED', message: 'Retry later' } });
  }
}

/** Returns true when the event moved money state, false when it was informational. */
async function processEvent(
  type: string,
  payment?: RawPaymentEntity,
  refund?: RawRefundEntity,
): Promise<boolean> {
  switch (type) {
    case 'payment.captured':
    case 'order.paid': {
      if (!payment) return false;
      await paymentsService.applyGatewayPayment(normalise(payment), 'webhook');
      return true;
    }

    case 'payment.authorized': {
      // Orders are created with auto-capture, so this is normally just the precursor
      // to `payment.captured`. Capture defensively if the gateway left it authorized.
      if (!payment || payment.captured) return false;
      const captured = await paymentProvider.capture(payment.id, payment.amount, payment.currency);
      await paymentsService.applyGatewayPayment(captured, 'webhook');
      return true;
    }

    case 'payment.failed': {
      if (!payment) return false;
      const row = await Payment.findOne({
        ...(payment.order_id ? { providerOrderId: payment.order_id } : { providerPaymentId: payment.id }),
      });
      if (!row) return false;
      await paymentsService.markFailed(String(row._id), {
        providerPaymentId: payment.id,
        method: payment.method,
        errorCode: payment.error_code ?? undefined,
        errorDescription: payment.error_description ?? undefined,
      });
      return true;
    }

    case 'refund.created':
    case 'refund.processed':
    case 'refund.failed': {
      if (!refund) return false;
      // Refunds we initiate are already recorded; this only syncs the gateway's
      // final status onto our row (async bank settlement can take days).
      const result = await Payment.updateOne(
        { 'refunds.refundId': refund.id },
        { $set: { 'refunds.$.status': refund.status } },
      );
      return result.modifiedCount > 0;
    }

    default:
      logger.debug({ type }, 'webhook: unhandled event type');
      return false;
  }
}

function normalise(p: RawPaymentEntity): ProviderPayment {
  return {
    providerPaymentId: p.id,
    providerOrderId: p.order_id,
    status: p.status as ProviderPayment['status'],
    amount: p.amount,
    amountRefunded: p.amount_refunded ?? 0,
    currency: p.currency,
    method: p.method,
    captured: p.captured ?? p.status === 'captured',
    errorCode: p.error_code ?? undefined,
    errorDescription: p.error_description ?? undefined,
  };
}
