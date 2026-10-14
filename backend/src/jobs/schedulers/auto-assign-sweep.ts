import { logger } from '../../config/logger.js';
import { autoAssignService } from '../../modules/delivery/auto-assign.service.js';

const SWEEP_INTERVAL_MS = 15_000; // offer windows are short (default 45s) — check often

/**
 * Drives the auto-assignment offer cascade: expires timed-out offers and (re)offers
 * anything ready and unclaimed. `deliveryTasksService` already triggers the first offer
 * the instant a task goes `ready`, so this sweep is the retry/cascade/catch-up path —
 * same relationship the payment-expiry sweeper has to the direct settlement flow.
 */
let timer: ReturnType<typeof setInterval> | null = null;

export function startAutoAssignSweeper(): void {
  if (timer) return;
  timer = setInterval(() => {
    void autoAssignService.sweep().catch((err) => logger.error({ err }, 'auto-assign-sweep: sweep failed'));
  }, SWEEP_INTERVAL_MS);
  timer.unref?.();
  logger.info('Auto-assignment sweeper started');
}

export function stopAutoAssignSweeper(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
