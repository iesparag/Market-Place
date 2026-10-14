import { SOCKET_EVENTS, type OrderStatusUpdated } from '@app/shared';
import { haversineKm } from '../../common/geo.js';
import { DeliveryTask, type DeliveryTaskDoc } from './delivery-task.model.js';
import { Rider, type RiderDoc } from '../riders/rider.model.js';
import { getDeliverySettings } from './delivery-settings.model.js';
import { emitToOrder, emitToAdmin, safeEmit } from '../../realtime/emitters.js';
import { AppError } from '../../common/AppError.js';

type DeliverySettings = Awaited<ReturnType<typeof getDeliverySettings>>;
/** Defined locally (not derived from the lean Mongoose doc type) so every field is a
 *  plain optional number — the doc type makes embedded objects nullable in ways that
 *  don't matter here, since `getDeliverySettings()` always backfills defaults. */
interface Weights {
  distance?: number | null;
  rating?: number | null;
  activeLoad?: number | null;
  reliability?: number | null;
  vehicleMatch?: number | null;
}

/**
 * Automatic rider assignment — scores every available rider against a task on 5
 * weighted criteria, offers it to the top-ranked one with a timeout, and cascades to
 * the next-ranked rider on decline/timeout. Mirrors `deliveryTasksService` in spirit
 * but is deliberately a separate module (not imported there) so
 * `deliveryTasksService` → `autoAssignService` stays one-directional — the task-status
 * machine and the scoring engine don't need to know about each other's internals
 * beyond this one trigger call.
 */

const VEHICLE_TIER: Record<string, number> = { bicycle: 0, bike: 0, scooter: 0, car: 1, van: 2 };

/** Rough capacity tier an order needs, from its total item count. */
function requiredTier(itemQty: number): number {
  if (itemQty > 10) return 2;
  if (itemQty > 4) return 1;
  return 0;
}

/** One rider's 0–1 fit for one task, weighted by the platform's configured criteria. */
function scoreRider(
  rider: Pick<RiderDoc, 'rating' | 'activeTaskCount' | 'offersReceived' | 'offersAccepted' | 'vehicleType' | 'currentLocation'>,
  pickup: { lat?: number | null; lng?: number | null } | undefined,
  itemQty: number,
  weights: Weights,
): number {
  // Distance: real haversine score when both ends have coordinates, else neutral.
  // Store/order addresses aren't geocoded yet, so this mostly falls back to neutral
  // today — it activates automatically once pickup/rider coordinates exist.
  let distanceScore = 0.5;
  if (pickup?.lat != null && pickup.lng != null && rider.currentLocation?.lat != null && rider.currentLocation?.lng != null) {
    const km = haversineKm(
      { lat: pickup.lat, lng: pickup.lng },
      { lat: rider.currentLocation.lat, lng: rider.currentLocation.lng },
    );
    distanceScore = Math.max(0, 1 - km / 10); // steep falloff; hard radius cutoff happens before this in rankCandidates
  }

  const ratingScore = Math.max(0, Math.min(1, (rider.rating ?? 5) / 5));
  const activeLoadScore = 1 / (1 + Math.max(0, rider.activeTaskCount ?? 0));
  const reliabilityScore =
    rider.offersReceived && rider.offersReceived > 0 ? (rider.offersAccepted ?? 0) / rider.offersReceived : 0.75;
  const tier = VEHICLE_TIER[rider.vehicleType ?? 'bike'] ?? 0;
  const need = requiredTier(itemQty);
  const vehicleMatchScore = tier >= need ? 1 : Math.max(0, 1 - 0.4 * (need - tier));

  return (
    distanceScore * (weights.distance ?? 0) +
    ratingScore * (weights.rating ?? 0) +
    activeLoadScore * (weights.activeLoad ?? 0) +
    reliabilityScore * (weights.reliability ?? 0) +
    vehicleMatchScore * (weights.vehicleMatch ?? 0)
  );
}

async function rankCandidates(
  task: Pick<DeliveryTaskDoc, 'tenantId' | 'riderId' | 'excludedRiderIds' | 'items' | 'pickupAddress'> & { _id: unknown },
  settings: DeliverySettings,
) {
  const excluded = (task.excludedRiderIds ?? []).map(String);
  if (task.riderId) excluded.push(String(task.riderId));
  const itemQty = (task.items ?? []).reduce((n, i) => n + (i.qty ?? 0), 0);

  const riders = await Rider.find({
    tenantId: task.tenantId ?? 'platform',
    isActive: true,
    status: 'available',
    _id: { $nin: excluded },
  }).lean();

  const scored: { rider: (typeof riders)[number]; score: number }[] = [];
  for (const rider of riders) {
    if (
      task.pickupAddress?.lat != null &&
      task.pickupAddress?.lng != null &&
      rider.currentLocation?.lat != null &&
      rider.currentLocation?.lng != null
    ) {
      const km = haversineKm(
        { lat: task.pickupAddress.lat, lng: task.pickupAddress.lng },
        { lat: rider.currentLocation.lat, lng: rider.currentLocation.lng },
      );
      if (km > (settings.maxAssignRadiusKm ?? 10)) continue; // out of range — hard exclude, not just low-scored
    }
    scored.push({
      rider,
      score: scoreRider(rider, task.pickupAddress ?? undefined, itemQty, settings.criteriaWeights ?? {}),
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function fallBackToManual(task: { _id: unknown; orderNumber: string }): Promise<void> {
  await DeliveryTask.updateOne({ _id: task._id }, { $unset: { offer: '' } });
  safeEmit(() =>
    emitToAdmin(SOCKET_EVENTS.NOTIFICATION_NEW, {
      id: String(task._id),
      title: 'No rider found — needs manual assignment',
      body: task.orderNumber,
      at: new Date().toISOString(),
    }),
  );
}

export const autoAssignService = {
  /**
   * Try to offer `taskId` to the best-ranked available rider. A no-op unless the task
   * is `ready`, own-fleet, unassigned, and not already mid-offer. Called directly when
   * a task becomes `ready` (deliveryTasksService) and again by the sweeper on
   * timeout/decline/boot-time catch-up — safe to call repeatedly.
   */
  async tryAutoAssign(taskId: string): Promise<void> {
    const settings = await getDeliverySettings();
    if (settings.assignmentMode !== 'auto') return;

    const task = await DeliveryTask.findById(taskId).lean();
    if (!task) return;
    if (task.status !== 'ready' || task.fulfillmentSource !== 'own_fleet' || task.riderId) return;
    if (task.offer?.expiresAt && task.offer.expiresAt.getTime() > Date.now()) return; // live offer already in flight

    const attemptsSoFar = task.excludedRiderIds?.length ?? 0;
    if (attemptsSoFar >= (settings.maxOfferCascadeAttempts ?? 5)) {
      await fallBackToManual(task);
      return;
    }

    const ranked = await rankCandidates(task, settings);
    if (ranked.length === 0) {
      await fallBackToManual(task);
      return;
    }

    const top = ranked[0]!.rider;
    const expiresAt = new Date(Date.now() + (settings.offerTimeoutSeconds ?? 45) * 1000);
    // Atomic — loses the race gracefully if something else (another sweep tick) already offered it.
    const claimed = await DeliveryTask.findOneAndUpdate(
      { _id: task._id, status: 'ready', riderId: { $exists: false }, offer: { $exists: false } },
      { $set: { offer: { riderId: top._id, sentAt: new Date(), expiresAt, attempt: attemptsSoFar + 1 } } },
      { new: true },
    );
    if (!claimed) return;
    await Rider.updateOne({ _id: top._id }, { $inc: { offersReceived: 1 } });
    // Riders poll GET /riders/me/offers rather than a push channel — no rider socket/FCM
    // wiring exists yet (see the standalone rider app), so there's nothing to emit here.
  },

  /** Rider accepts their current offer — finalizes the assignment, same effect as a manual assign.
   *  Requires `expiresAt` still in the future: the sweeper only clears stale offers on its next
   *  tick (up to 15s later), so without this check a rider could accept a window that's
   *  already conceptually expired and should have cascaded to the next-ranked rider. */
  async acceptOffer(taskId: string, riderId: string) {
    const claimed = await DeliveryTask.findOneAndUpdate(
      { _id: taskId, 'offer.riderId': riderId, 'offer.expiresAt': { $gt: new Date() }, riderId: { $exists: false } },
      { $set: { riderId, assignmentMode: 'auto', assignedAt: new Date() }, $unset: { offer: '' } },
      { new: true },
    );
    if (!claimed) throw AppError.conflict('This offer is no longer available');

    await Rider.updateOne({ _id: riderId }, { $inc: { activeTaskCount: 1, offersAccepted: 1 } });
    announce(claimed);
    return claimed;
  },

  /** Rider declines — the task cascades to the next-ranked rider immediately, no need to wait out the timeout. */
  async declineOffer(taskId: string, riderId: string): Promise<void> {
    const claimed = await DeliveryTask.findOneAndUpdate(
      { _id: taskId, 'offer.riderId': riderId },
      { $unset: { offer: '' }, $push: { excludedRiderIds: riderId } },
      { new: true },
    );
    if (!claimed) throw AppError.conflict('This offer is no longer available');
    void this.tryAutoAssign(taskId);
  },

  /** Sweeper tick: expire stale offers, then (re)offer anything that's ready and unclaimed. */
  async sweep(): Promise<void> {
    const settings = await getDeliverySettings();
    if (settings.assignmentMode !== 'auto') return;

    const now = new Date();
    const expiring = await DeliveryTask.find({ 'offer.expiresAt': { $lt: now } })
      .select('_id offer')
      .lean();
    for (const t of expiring) {
      await DeliveryTask.updateOne(
        { _id: t._id, 'offer.riderId': t.offer?.riderId },
        { $unset: { offer: '' }, $push: { excludedRiderIds: t.offer?.riderId } },
      );
    }

    const pending = await DeliveryTask.find({
      status: 'ready',
      fulfillmentSource: 'own_fleet',
      riderId: { $exists: false },
      offer: { $exists: false },
    })
      .select('_id')
      .limit(100)
      .lean();
    for (const t of pending) {
      await this.tryAutoAssign(String(t._id));
    }
  },
};

/** Live push only — order room hears the new state. Deliberately duplicated from
 *  delivery-tasks.service.ts's identical helper to avoid an import cycle between the
 *  two modules (see the file header). */
function announce(task: { _id: unknown; orderId: unknown; status: string }): void {
  const orderId = String(task.orderId);
  safeEmit(() =>
    emitToOrder(orderId, SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
      orderId,
      subOrderId: String(task._id),
      status: task.status as OrderStatusUpdated['status'],
      at: new Date().toISOString(),
    }),
  );
}
