import { Queue, type ConnectionOptions } from 'bullmq';
import { getRedis } from '../config/redis.js';

/**
 * BullMQ queues. Lazily created so the app can boot without Redis in dev.
 * Workers live in ./workers and are started separately (or in-process for dev).
 */
export const QUEUE_NAMES = {
  webhook: 'process-webhook',
  notification: 'send-notification',
  payouts: 'run-payouts',
  catalogSync: 'sync-catalog',
  reindex: 'reindex-search',
  reconcile: 'reconcile-ledger',
} as const;

let queues: Record<string, Queue> | null = null;

export function getQueue(name: string): Queue {
  if (!queues) queues = {};
  if (!queues[name]) {
    // Cast: a single shared ioredis instance may differ nominally from BullMQ's bundled ioredis.
    queues[name] = new Queue(name, { connection: getRedis() as unknown as ConnectionOptions });
  }
  return queues[name]!;
}
