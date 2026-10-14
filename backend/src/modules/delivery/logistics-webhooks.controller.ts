import type { Request, Response } from 'express';
import { logger } from '../../config/logger.js';
import { logisticsProvider, LogisticsProviderError } from '../../providers/logistics/index.js';
import { LogisticsEvent } from './logistics-event.model.js';
import { DeliveryTask } from './delivery-task.model.js';
import { deliveryTasksService } from './delivery-tasks.service.js';

/** The courier's event `type` → our internal task status. Unknown types are acked, ignored. */
const TYPE_TO_STATUS: Record<string, 'shipped' | 'delivered' | 'cancelled'> = {
  'task.picked_up': 'shipped',
  'task.out_for_delivery': 'shipped',
  'task.delivered': 'delivered',
  'task.cancelled': 'cancelled',
};

interface LogisticsPayload {
  externalTaskId?: string;
  taskId?: string;
}

/**
 * Third-party courier → us. Mounted on the RAW body (before `express.json`), same
 * contract as handlePaymentWebhook: bad signature → 400 never retried, already
 * processed → 200 no-op, processing failure → 500 so the courier retries.
 */
export async function handleLogisticsWebhook(req: Request, res: Response): Promise<void> {
  let event;
  try {
    event = logisticsProvider.verifyWebhook(req.body as Buffer, req.headers as Record<string, string | undefined>);
  } catch (err) {
    const code = err instanceof LogisticsProviderError ? err.providerCode : 'INVALID';
    logger.warn({ err, ip: req.ip }, 'logistics webhook: rejected');
    res.status(400).json({ ok: false, error: { code, message: 'Invalid webhook' } });
    return;
  }

  const payload = event.payload as LogisticsPayload;

  const claim = await LogisticsEvent.findOneAndUpdate(
    { provider: logisticsProvider.name, eventId: event.id },
    {
      $setOnInsert: {
        provider: logisticsProvider.name,
        eventId: event.id,
        type: event.type,
        status: 'received',
        externalTaskId: payload.externalTaskId,
        payload: event.payload,
      },
    },
    { new: true, upsert: true },
  );

  if (claim.status === 'processed' || claim.status === 'ignored') {
    res.status(200).json({ ok: true, data: { duplicate: true } });
    return;
  }

  try {
    const handled = await processEvent(event.type, payload);
    await LogisticsEvent.updateOne(
      { _id: claim._id },
      { $set: { status: handled ? 'processed' : 'ignored', processedAt: new Date(), error: null } },
    );
    res.status(200).json({ ok: true, data: { handled } });
  } catch (err) {
    logger.error({ err, eventId: event.id, type: event.type }, 'logistics webhook: processing failed');
    await LogisticsEvent.updateOne(
      { _id: claim._id },
      { $set: { status: 'error', error: String(err), processedAt: new Date() } },
    );
    res.status(500).json({ ok: false, error: { code: 'WEBHOOK_FAILED', message: 'Retry later' } });
  }
}

async function processEvent(type: string, payload: LogisticsPayload): Promise<boolean> {
  const status = TYPE_TO_STATUS[type];
  if (!status) return false;

  const task = payload.taskId
    ? await DeliveryTask.findById(payload.taskId).select('_id').lean()
    : await DeliveryTask.findOne({ 'thirdParty.externalTaskId': payload.externalTaskId }).select('_id').lean();
  if (!task) return false;

  await deliveryTasksService.applyExternalStatus(String(task._id), status);
  return true;
}
