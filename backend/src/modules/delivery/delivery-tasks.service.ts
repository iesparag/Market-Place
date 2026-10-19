import { SOCKET_EVENTS } from '@app/shared';
import { logger } from '../../config/logger.js';
import { AppError } from '../../common/AppError.js';
import { env } from '../../config/env.js';
import { Store } from '../stores/store.model.js';
import { User } from '../auth/user.model.js';
import { Order } from '../orders/order.model.js';
import { Rider } from '../riders/rider.model.js';
import { DeliveryTask } from './delivery-task.model.js';
import { getDeliverySettings } from './delivery-settings.model.js';
import { autoAssignService } from './auto-assign.service.js';
import { logisticsProvider } from '../../providers/logistics/index.js';
import { emitToOrder, emitToStore, emitToAdmin, emitToRider, safeEmit } from '../../realtime/emitters.js';
import { notify } from '../notifications/notifications.module.js';
import { notifyRider } from '../riders/rider-push.js';
import { whatsappProvider } from '../../providers/whatsapp/index.js';
import { routingService } from '../routing/routing.service.js';
import { RiderPayoutRate } from '../riders/rider-payout-rate.model.js';
import { WhatsAppTemplate } from '../whatsapp/whatsapp.module.js';
import { haversineKm } from '../../common/geo.js';

export interface OrderForDeliveryTasks {
  _id: unknown;
  orderNumber: string;
  customerId: unknown;
  storeIds?: unknown[];
  items: { productId: unknown; storeId: unknown; title?: string | null; image?: string | null; qty: number }[];
  shippingAddress?: {
    line1?: string | null; line2?: string | null; landmark?: string | null;
    city?: string | null; state?: string | null; pincode?: string | null;
    lat?: number | null; lng?: number | null;
  } | null;
  // Mongoose Map fields come through as a JS Map on a hydrated doc but a plain object
  // once .lean()'d — normalized to a Map in createForOrder() before use either way.
  storeInstructions?: Map<string, string> | Record<string, string> | null;
}

const STATUS_FLOW = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'pickup_started',
  'pickup_arrived',
  'picked_up',
  'delivery_started',
  'delivery_arrived',
  'delivered',
] as const;
type TaskStatus = (typeof STATUS_FLOW)[number] | 'cancelled' | 'refunded';

/** The rider-controlled leg — from "assigned and ready" through to handoff. Used to
 *  gate what a rider may set (see updateStatus) and which statuses count as "actively
 *  out working" for GPS broadcast (see riders.service.ts updateLocation). */
export const RIDER_STATUSES = [
  'pickup_started',
  'pickup_arrived',
  'picked_up',
  'delivery_started',
  'delivery_arrived',
  'delivered',
] as const;

/** What the task's *current* status must be for a transition to the key to be valid.
 *  `cancelled` is reachable from any non-terminal state, so it's left unconstrained here
 *  and only gated by the role checks above. */
const VALID_FROM: Partial<Record<TaskStatus, TaskStatus[]>> = {
  accepted: ['pending'],
  preparing: ['accepted'],
  ready: ['preparing'],
  pickup_started: ['ready'],
  pickup_arrived: ['pickup_started'],
  picked_up: ['pickup_arrived'],
  delivery_started: ['picked_up'],
  delivery_arrived: ['delivery_started'],
  delivered: ['delivery_arrived'],
};

/**
 * Rider-facing enrichment — a bare DeliveryTask only has customerId/storeId refs and
 * lat/lng; a rider actually doing the pickup/delivery needs names, phone numbers to
 * call, and (for COD) how much cash to collect. Resolved in three batched queries
 * (never N+1 per task) and merged onto each task as flat fields, so the rider app's
 * TaskModel can parse them directly without a second round-trip per task.
 */
async function enrichTasksForRider<T extends {
  storeId: unknown;
  customerId: unknown;
  orderId: unknown;
  pickupAddress?: { lat?: number | null; lng?: number | null; city?: string | null } | null;
  dropAddress?: { lat?: number | null; lng?: number | null; city?: string | null } | null;
  payoutAmount?: number | null;
  payoutDistanceMeters?: number | null;
}>(
  tasks: T[],
): Promise<(T & {
  storeName?: string | null; storePhone?: string | null;
  customerName?: string | null; customerPhone?: string | null;
  codAmount?: number | null;
  pickupDropDistanceKm?: number | null;
  ratePerKm?: number | null;
  estimatedPayout?: number | null;
})[]> {
  if (!tasks.length) return [];
  const storeIds = [...new Set(tasks.map((t) => String(t.storeId)))];
  const customerIds = [...new Set(tasks.map((t) => String(t.customerId)))];
  const orderIds = [...new Set(tasks.map((t) => String(t.orderId)))];
  const [stores, customers, orders, rates] = await Promise.all([
    Store.find({ _id: { $in: storeIds } }).select('name contactPhone address').lean(),
    User.find({ _id: { $in: customerIds } }).select('name phone').lean(),
    Order.find({ _id: { $in: orderIds } }).select('payment.method amounts.grandTotal').lean(),
    RiderPayoutRate.find({ active: true }).lean(),
  ]);
  const storeById = new Map(stores.map((s) => [String(s._id), s]));
  const customerById = new Map(customers.map((c) => [String(c._id), c]));
  const orderById = new Map(orders.map((o) => [String(o._id), o]));
  const rateByCity = new Map(rates.map((r) => [r.city.toLowerCase().trim(), r.ratePerKm]));

  return tasks.map((t) => {
    const store = storeById.get(String(t.storeId));
    const customer = customerById.get(String(t.customerId));
    const order = orderById.get(String(t.orderId));

    const pLat = t.pickupAddress?.lat ?? (store as any)?.address?.lat;
    const pLng = t.pickupAddress?.lng ?? (store as any)?.address?.lng;
    const dLat = t.dropAddress?.lat;
    const dLng = t.dropAddress?.lng;

    let pickupDropDistanceKm: number | undefined;
    if (pLat != null && pLng != null && dLat != null && dLng != null) {
      const d = haversineKm({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng });
      pickupDropDistanceKm = Math.round(d * 10) / 10;
    } else if (t.payoutDistanceMeters != null) {
      pickupDropDistanceKm = Math.round(((t.payoutDistanceMeters / 1000)) * 10) / 10;
    }

    const dropCity = (t.dropAddress?.city || t.pickupAddress?.city || (store as any)?.address?.city || '').toLowerCase().trim();
    // Default rate: 800 paise (₹8/km) if city not explicitly added yet
    const ratePerKm = rateByCity.get(dropCity) ?? 800;
    const estimatedPayout = t.payoutAmount ?? (pickupDropDistanceKm != null ? Math.round(pickupDropDistanceKm * ratePerKm) : undefined);

    logger.info(
      {
        taskId: (t as any)._id,
        orderNumber: (t as any).orderNumber,
        pickupDropDistanceKm,
        ratePerKm,
        estimatedPayout,
      },
      `[RIDER TASK ENRICH] pickup-to-drop: ${pickupDropDistanceKm ?? 'N/A'}km @ ₹${(ratePerKm / 100).toFixed(2)}/km => payout ₹${estimatedPayout != null ? (estimatedPayout / 100).toFixed(2) : 'N/A'}`
    );

    return {
      ...t,
      storeName: store?.name,
      storePhone: store?.contactPhone,
      customerName: customer?.name,
      customerPhone: customer?.phone,
      codAmount: order?.payment?.method === 'cod' ? order.amounts?.grandTotal : undefined,
      pickupDropDistanceKm,
      ratePerKm,
      estimatedPayout,
    };
  });
}

/**
 * A COD order is only "confirmed" at checkout, never paid (see paymentsService.startCod's
 * comment) — cash actually changes hands when the rider hands over the package. Without
 * this, a COD order's `payment.status` stays 'pending' forever: no commission/ledger
 * entries ever get created (those only fire from settlementService.settlePrepaid), so a
 * vendor's COD sales would never show up for payout even though the cash was collected.
 * Settles the WHOLE order (not per-store) once every DeliveryTask on it is delivered —
 * a multi-vendor COD order can have separate riders finishing at different times, and
 * `payment` is one field on the order, not one per store.
 *
 * Dynamic import to avoid a static circular dependency: settlement.service.ts already
 * imports this file (to create delivery tasks once a prepaid order settles); by the time
 * this actually runs (a rider marking 'delivered'), both modules are fully loaded, so the
 * cycle is harmless here but would NOT be safe as a top-level `import`.
 */
async function maybeSettleCod(orderId: unknown): Promise<void> {
  const order = await Order.findById(orderId).select('payment status').lean();
  if (!order || order.payment?.method !== 'cod' || order.payment?.status === 'paid') return;
  const tasks = await DeliveryTask.find({ orderId }).select('status').lean();
  const allDelivered = tasks.length > 0 && tasks.every((t) => t.status === 'delivered');
  if (!allDelivered) return;
  const { settlementService } = await import('../payments/settlement.service.js');
  await settlementService.settlePrepaid(String(orderId), { provider: 'cod', method: 'cod' });
}

/**
 * Rider payout for one delivered task — distance × the drop city's configured ₹/km
 * rate (RiderPayoutRate). Distance comes from OSRM's road route between the FIXED
 * pickup/drop points, never the rider's actual GPS trail — a trail-based distance is
 * gameable (wander further, earn more); a route between two addresses the rider
 * doesn't choose is not. Silently no-ops (not an error) when:
 *   - either address is missing lat/lng (can't route)
 *   - no RiderPayoutRate exists for the drop city (admin hasn't opted that city in yet)
 *   - the resulting distance exceeds RIDER_PAYOUT_MAX_DISTANCE_KM (bad routing data —
 *     every genuine delivery is already far inside this by the checkout-time radius
 *     check, so a distance this large means something is wrong, not a real long-haul job)
 */
async function maybeComputePayout(taskId: string): Promise<void> {
  const task = await DeliveryTask.findById(taskId).select('pickupAddress dropAddress payoutAmount').lean();
  if (!task || task.payoutAmount != null) return; // already computed (idempotent)
  const pickup = task.pickupAddress;
  const drop = task.dropAddress;
  if (pickup?.lat == null || pickup?.lng == null || drop?.lat == null || drop?.lng == null) return;

  const dropCity = drop.city?.toLowerCase().trim();
  if (!dropCity) return;
  const rate = await RiderPayoutRate.findOne({ city: dropCity, active: true }).lean();
  if (!rate) return;

  const route = await routingService.route({ lat: pickup.lat, lng: pickup.lng }, { lat: drop.lat, lng: drop.lng });
  if (!route) return;
  const distanceKm = route.distanceMeters / 1000;
  if (distanceKm > env.RIDER_PAYOUT_MAX_DISTANCE_KM) {
    logger.warn({ taskId, distanceKm }, 'maybeComputePayout: route distance exceeds sanity cap — skipping payout');
    return;
  }

  await DeliveryTask.updateOne(
    { _id: taskId },
    { $set: { payoutDistanceMeters: route.distanceMeters, payoutAmount: Math.round(distanceKm * rate.ratePerKm) } },
  );
}

export const deliveryTasksService = {
  /**
   * One DeliveryTask per store on the order. Called only once the order is a real
   * commitment — from `settlementService.settlePrepaid` and `paymentsService.startCod`,
   * never from `ordersService.create()` (a freshly created prepaid order is still a
   * draft awaiting payment, same reasoning the existing code already uses for when to
   * send "Order placed"). Idempotent via the (orderId, storeId) unique index, so a
   * retried settlement can never spawn duplicate tasks.
   */
  async createForOrder(order: OrderForDeliveryTasks) {
    const storeIds = order.storeIds?.length ? order.storeIds : [...new Set(order.items.map((i) => String(i.storeId)))];
    const stores = await Store.find({ _id: { $in: storeIds } }).select('name address location ownerId contactPhone').lean();
    const storeById = new Map(stores.map((s) => [String(s._id), s]));
    const instructionsByStore =
      order.storeInstructions instanceof Map
        ? order.storeInstructions
        : new Map(Object.entries(order.storeInstructions ?? {}));
    // Resolved once per order, not once per store — a vendor-order-notify template is
    // off by default (no env var set) just like WHATSAPP_CART_REMINDER_TEMPLATE, so most
    // installs pay for this lookup zero times.
    const newOrderTemplate = env.WHATSAPP_NEW_ORDER_TEMPLATE
      ? await WhatsAppTemplate.findOne({ name: env.WHATSAPP_NEW_ORDER_TEMPLATE, status: 'approved' }).lean()
      : null;
    const settings = await getDeliverySettings();
    const serviceableCities = new Set(settings.serviceableCities.map((c) => c.toLowerCase().trim()));
    const dropCity = order.shippingAddress?.city?.toLowerCase().trim();
    // No serviceable-city list configured yet ⇒ treat everywhere as our own fleet
    // (an empty allowlist defaulting to "nothing is serviceable" would silently route
    // every order to a third party the moment delivery is turned on).
    const isServiceable = serviceableCities.size === 0 || (dropCity != null && serviceableCities.has(dropCity));
    const fulfillmentSource = isServiceable || !settings.thirdPartyFallbackEnabled ? 'own_fleet' : 'third_party';

    const created = [];
    for (const storeId of storeIds) {
      const storeIdStr = String(storeId);
      const items = order.items
        .filter((i) => String(i.storeId) === storeIdStr)
        .map((i) => ({ productId: i.productId, title: i.title, qty: i.qty, image: i.image }));
      if (!items.length) continue;
      const store = storeById.get(storeIdStr);
      const instructions = instructionsByStore.get(storeIdStr);
      const storeCoords = store?.location?.coordinates; // GeoJSON [lng, lat]
      const pickupAddress = store?.address
        ? {
            line1: store.address.line1,
            city: store.address.city,
            lat: storeCoords?.[1],
            lng: storeCoords?.[0],
          }
        : undefined;
      const dropAddress = order.shippingAddress
        ? {
            line1: order.shippingAddress.line1,
            line2: order.shippingAddress.line2,
            landmark: order.shippingAddress.landmark,
            city: order.shippingAddress.city,
            state: order.shippingAddress.state,
            pincode: order.shippingAddress.pincode,
            lat: order.shippingAddress.lat,
            lng: order.shippingAddress.lng,
          }
        : undefined;

      let pickupDropDistanceKm: number | undefined;
      const pLat = pickupAddress?.lat;
      const pLng = pickupAddress?.lng;
      const dLat = dropAddress?.lat;
      const dLng = dropAddress?.lng;
      if (pLat != null && pLng != null && dLat != null && dLng != null) {
        const d = haversineKm({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng });
        pickupDropDistanceKm = Math.round(d * 10) / 10;
      }
      const city = (dropAddress?.city || pickupAddress?.city || '').toLowerCase().trim();
      const rateDoc = await RiderPayoutRate.findOne({ city, active: true }).lean();
      const ratePerKm = rateDoc?.ratePerKm ?? 800; // 800 paise = ₹8/km
      const estimatedPayout = pickupDropDistanceKm != null ? Math.round(pickupDropDistanceKm * ratePerKm) : undefined;

      const task = await DeliveryTask.findOneAndUpdate(
        { orderId: order._id, storeId },
        {
          $setOnInsert: {
            tenantId: 'platform',
            orderId: order._id,
            orderNumber: order.orderNumber,
            storeId,
            customerId: order.customerId,
            items,
            status: 'pending',
            statusHistory: [{ status: 'pending', at: new Date() }],
            pickupAddress,
            dropAddress,
            pickupDropDistanceKm,
            ratePerKm,
            estimatedPayout,
            fulfillmentSource,
            instructions,
          },
        },
        { new: true, upsert: true },
      );
      created.push(task);
      safeEmit(() =>
        emitToStore(storeIdStr, SOCKET_EVENTS.SUBORDER_NEW, {
          subOrderId: String(task._id),
          storeId: storeIdStr,
          orderNumber: order.orderNumber,
          itemsCount: items.length,
          at: new Date().toISOString(),
        }),
      );
      // New-order notify to the vendor — two channels, both best-effort:
      //  - notify() → persisted Notification + live toast (via the socket listener
      //    above) whenever they're on the portal, same mechanism customers get.
      //  - WhatsApp → reaches them even when NOT on the portal. Gated on
      //    WHATSAPP_NEW_ORDER_TEMPLATE being configured + approved (see
      //    cart-reminder-sweep.ts for the identical off-by-default pattern) and on the
      //    store having a contactPhone. This is a transactional/utility notification
      //    about the vendor's OWN order, not a marketing message, so it does not gate on
      //    the customer-facing User.whatsappOptIn flag (that's a different relationship).
      if (store?.ownerId) {
        void notify(String(store.ownerId), {
          type: 'order',
          title: 'New order 🛎️',
          body: `${order.orderNumber} · ${items.length} item${items.length === 1 ? '' : 's'}${instructions ? ` · "${instructions}"` : ''}`,
          link: `/order/${String(order._id)}`,
        });
      }
      if (newOrderTemplate && store?.contactPhone) {
        void whatsappProvider.sendTemplate({
          to: store.contactPhone,
          templateName: newOrderTemplate.name,
          languageCode: newOrderTemplate.language,
          bodyParams: Array.from({ length: newOrderTemplate.variableCount }, (_, i) =>
            i === 0 ? (store.name ?? 'there') : i === 1 ? order.orderNumber : (instructions ?? '')),
        });
      }

      // Only dispatch brand-new third-party tasks — a retried settlement hits the
      // upsert above as a no-op (task already existed), so this must not re-dispatch.
      if (fulfillmentSource === 'third_party' && !task.thirdParty?.externalTaskId) {
        try {
          const result = await logisticsProvider.dispatch({
            taskId: String(task._id),
            orderNumber: order.orderNumber,
            pickup: pickupAddress ?? {},
            drop: dropAddress ?? {},
            items: items.map((i) => ({ title: i.title, qty: i.qty })),
          });
          await DeliveryTask.updateOne(
            { _id: task._id },
            {
              thirdParty: { provider: logisticsProvider.name, externalTaskId: result.externalTaskId, trackingUrl: result.trackingUrl },
            },
          );
        } catch (err) {
          // Dispatch failure shouldn't break order creation — the task stays
          // third_party/undispatched and is visible to admin to retry or reroute.
          logger.error({ err, taskId: String(task._id) }, 'logistics dispatch failed');
        }
      }
    }
    return created;
  },

  async listForAdmin(filter: { status?: string; unassigned?: boolean } = {}) {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.unassigned) query.riderId = { $exists: false };
    return DeliveryTask.find(query).sort({ createdAt: -1 }).limit(200).lean();
  },

  async listForStore(storeId: string) {
    return DeliveryTask.find({ storeId }).sort({ createdAt: -1 }).lean();
  },

  async listForRider(riderId: string) {
    const tasks = await DeliveryTask.find({
      riderId,
      status: { $in: ['ready', ...RIDER_STATUSES.filter((s) => s !== 'delivered')] },
    })
      .sort({ createdAt: -1 })
      .lean();
    return enrichTasksForRider(tasks);
  },

  /** Tasks currently offered to this rider (auto-assignment) and still within their offer window. */
  async listOffersForRider(riderId: string) {
    const tasks = await DeliveryTask.find({ 'offer.riderId': riderId, 'offer.expiresAt': { $gt: new Date() } })
      .sort({ 'offer.sentAt': -1 })
      .lean();
    return enrichTasksForRider(tasks);
  },

  /**
   * This rider's completed/cancelled history — "what did I accomplish" (the explicit
   * ask: a rider should be able to see and verify their own track record, not just the
   * live queue). Capped at 100 + a day-range filter rather than unbounded, since a
   * long-tenured rider's full history could otherwise be thousands of rows.
   */
  async historyForRider(riderId: string, opts: { days?: number } = {}) {
    const since = new Date(Date.now() - (opts.days ?? 30) * 86_400_000);
    const tasks = await DeliveryTask.find({
      riderId,
      status: { $in: ['delivered', 'cancelled'] },
      updatedAt: { $gte: since },
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    return enrichTasksForRider(tasks);
  },

  /**
   * Customer-safe delivery view for an order's own detail screen — per-store status,
   * timeline, and (if assigned) just enough about the rider to show "who's bringing
   * it" and seed a live-tracking map before the first DELIVERY_LOCATION socket event
   * arrives. Never includes the rider's phone or any admin-only fields.
   */
  async listForOrder(orderId: string) {
    const tasks = await DeliveryTask.find({ orderId }).select('-excludedRiderIds -offer').lean();
    const riderIds = tasks.map((t) => t.riderId).filter((id): id is NonNullable<typeof id> => Boolean(id));
    const riders = riderIds.length
      ? await Rider.find({ _id: { $in: riderIds } }).select('name vehicleType currentLocation').lean()
      : [];
    const riderById = new Map(riders.map((r) => [String(r._id), r]));

    return tasks.map((t) => {
      const rider = t.riderId ? riderById.get(String(t.riderId)) : undefined;
      return {
        _id: String(t._id),
        storeId: String(t.storeId),
        status: t.status,
        statusHistory: t.statusHistory ?? [],
        fulfillmentSource: t.fulfillmentSource,
        trackingUrl: t.thirdParty?.trackingUrl,
        // Destination for the live rider→drop polyline (customer_app's order-tracking map).
        dropLat: t.dropAddress?.lat,
        dropLng: t.dropAddress?.lng,
        rider: rider
          ? { name: rider.name, vehicleType: rider.vehicleType, lastKnownLocation: rider.currentLocation }
          : undefined,
      };
    });
  },

  async getById(id: string) {
    const task = await DeliveryTask.findById(id).lean();
    if (!task) throw AppError.notFound('Delivery task not found');
    return task;
  },

  /** Manual assignment (and reassignment) — admin, or the vendor whose store owns the task. */
  async assign(id: string, riderId: string, actor: { role: string; storeId?: string }) {
    const existing = await DeliveryTask.findById(id).lean();
    if (!existing) throw AppError.notFound('Delivery task not found');
    const isStoreScoped = actor.role === 'vendor' || actor.role === 'vendor_staff';
    if (isStoreScoped && String(existing.storeId) !== actor.storeId) throw AppError.forbidden('Not your task');
    if (existing.status === 'delivered' || existing.status === 'cancelled')
      throw AppError.badRequest('TASK_CLOSED', 'This task is already closed');
    if (existing.fulfillmentSource === 'third_party')
      throw AppError.badRequest('THIRD_PARTY_TASK', 'This task is routed to a third-party courier, not our own fleet');

    const rider = await Rider.findById(riderId);
    if (!rider || !rider.isActive) throw AppError.notFound('Rider not found');

    const previousRiderId = existing.riderId;
    const task = await DeliveryTask.findByIdAndUpdate(
      id,
      { $set: { riderId: rider._id, assignmentMode: 'manual', assignedAt: new Date() } },
      { new: true },
    );
    if (!task) throw AppError.notFound('Delivery task not found');

    // Reassignment: release the previous rider's slot before claiming the new one.
    if (previousRiderId && String(previousRiderId) !== riderId) {
      await Rider.updateOne({ _id: previousRiderId }, { $inc: { activeTaskCount: -1 } });
    }
    if (!previousRiderId || String(previousRiderId) !== riderId) {
      await Rider.updateOne({ _id: riderId }, { $inc: { activeTaskCount: 1 } });
    }

    announce(task, task.status as TaskStatus); // let the order room know a rider is now on it
    void notifyRider(riderId, { title: 'New delivery assigned 📦', body: task.orderNumber, data: { taskId: String(task._id) } });
    announceTaskEvent(task, previousRiderId && String(previousRiderId) !== riderId ? 'reassigned' : 'assigned', riderId, rider.name);
    if (previousRiderId && String(previousRiderId) !== riderId) {
      void notifyRider(String(previousRiderId), { title: 'Delivery reassigned', body: `${task.orderNumber} was moved to another rider` });
      announceTaskEvent(task, 'reassigned', String(previousRiderId));
    }
    return task;
  },

  /** Clear a task's rider without closing it — it goes back to the unassigned pool. */
  async unassign(id: string, actor: { role: string; storeId?: string }) {
    const existing = await DeliveryTask.findById(id).lean();
    if (!existing) throw AppError.notFound('Delivery task not found');
    const isStoreScoped = actor.role === 'vendor' || actor.role === 'vendor_staff';
    if (isStoreScoped && String(existing.storeId) !== actor.storeId) throw AppError.forbidden('Not your task');

    const previousRiderId = existing.riderId;
    if (!previousRiderId) return existing; // already unassigned — no-op

    const task = await DeliveryTask.findByIdAndUpdate(
      id,
      { $unset: { riderId: '', assignmentMode: '', assignedAt: '' } },
      { new: true },
    );
    if (!task) throw AppError.notFound('Delivery task not found');
    await Rider.updateOne({ _id: previousRiderId }, { $inc: { activeTaskCount: -1 } });

    announce(task, task.status as TaskStatus);
    void notifyRider(String(previousRiderId), { title: 'Delivery unassigned', body: `${task.orderNumber} was removed from your list` });
    announceTaskEvent(task, 'unassigned', String(previousRiderId));
    return task;
  },

  /**
   * Advance a task's status. Scope: rider → only their own assigned task, pickup/deliver
   * only. vendor/staff → only their store's task, prep stages + cancel. admin/super → any.
   * Also enforces the forward-only state machine — e.g. a rider can't mark a task
   * `delivered` before it was ever `shipped`.
   */
  async updateStatus(
    id: string,
    status: TaskStatus,
    actor: { kind: 'rider' | 'user'; riderId?: string; role?: string; storeId?: string },
  ) {
    const existing = await DeliveryTask.findById(id).lean();
    if (!existing) throw AppError.notFound('Delivery task not found');

    if (actor.kind === 'rider') {
      if (String(existing.riderId) !== actor.riderId) throw AppError.forbidden('Not your task');
      if (!(RIDER_STATUSES as readonly TaskStatus[]).includes(status))
        throw AppError.badRequest('BAD_STATUS', 'Riders can only move a task through the pickup/delivery stages');
    } else {
      const isStoreScoped = actor.role === 'vendor' || actor.role === 'vendor_staff';
      if (isStoreScoped) {
        if (String(existing.storeId) !== actor.storeId) throw AppError.forbidden('Not your task');
        if (!(['accepted', 'preparing', 'ready', 'cancelled'] as TaskStatus[]).includes(status))
          throw AppError.badRequest('BAD_STATUS', 'Vendors can only move a task through prep or cancel it');
      }
    }

    const allowedFrom = VALID_FROM[status];
    if (allowedFrom && !allowedFrom.includes(existing.status as TaskStatus))
      throw AppError.badRequest(
        'BAD_TRANSITION',
        `Cannot mark a task "${status}" from its current status "${existing.status}"`,
      );

    const task = await writeStatus(id, existing.status as TaskStatus, status);
    if (!task)
      throw AppError.conflict('This task’s status just changed — please retry');

    if (status === 'delivered' && task.riderId) {
      await Rider.updateOne({ _id: task.riderId }, { $inc: { activeTaskCount: -1, totalDeliveries: 1 } });
      await maybeSettleCod(task.orderId);
      await maybeComputePayout(id);
    } else if (status === 'cancelled' && task.riderId) {
      await Rider.updateOne({ _id: task.riderId }, { $inc: { activeTaskCount: -1 } });
    }

    notifyStatusChange(task, status);
    // Own-fleet task just became pickup-ready — kick off scoring/offering if auto mode
    // is on. A no-op for third-party tasks or when assignment is manual (checked inside).
    if (status === 'ready') void autoAssignService.tryAutoAssign(id);
    return task;
  },

  /**
   * Status change driven by an inbound third-party-courier webhook — no actor, the
   * webhook itself is the source of truth (same trust model as payment webhooks).
   * Still forward-only, but an invalid/out-of-order transition is a silent no-op
   * (webhooks can redeliver or race) rather than an error that would fail the ack.
   */
  async applyExternalStatus(taskId: string, status: TaskStatus) {
    const existing = await DeliveryTask.findById(taskId).lean();
    if (!existing) return null;
    // A third-party courier doesn't report our own riders' granular pickup/delivery
    // sub-stages (see TYPE_TO_STATUS in logistics-webhooks.controller.ts), so this is
    // deliberately NOT the strict VALID_FROM sequential check updateStatus() uses —
    // only reject if the task is already in a terminal state (don't resurrect a
    // cancelled/delivered task from a late or redelivered webhook).
    if (existing.status === 'delivered' || existing.status === 'cancelled' || existing.status === 'refunded') {
      return existing;
    }

    const task = await writeStatus(taskId, existing.status as TaskStatus, status);
    if (!task) return existing; // lost a concurrent race — the webhook can redeliver

    notifyStatusChange(task, status);
    return task;
  },
};

/**
 * Atomically move a task from `fromStatus` to `toStatus` AND append the history entry
 * in one write. Combining them avoids the separate load→mutate→save() + fire-and-forget
 * `$push` pattern, which raced: an in-flight save from one request could re-$set a
 * statusHistory array it loaded before an earlier request's push had landed, silently
 * dropping that entry. The `status: fromStatus` filter also doubles as an optimistic
 * lock — a concurrent transition on the same task makes this a no-op (returns null)
 * instead of corrupting state.
 */
async function writeStatus(id: string, fromStatus: TaskStatus, toStatus: TaskStatus) {
  return DeliveryTask.findOneAndUpdate(
    { _id: id, status: fromStatus },
    { $set: { status: toStatus }, $push: { statusHistory: { status: toStatus, at: new Date() } } },
    { new: true },
  );
}

interface TaskLike {
  _id: unknown;
  orderId: unknown;
  orderNumber: string;
  customerId: unknown;
}

/** Socket nudge (on top of the FCM push) for the admin dashboard's alert sound and the
 *  rider app's live list refresh — sent to the `admin` room and, when there's a
 *  specific rider, their own `rider:{id}` room. */
function announceTaskEvent(
  task: { _id: unknown; orderNumber: string },
  kind: 'offered' | 'assigned' | 'unassigned' | 'reassigned',
  riderId?: string,
  riderName?: string,
): void {
  const payload = { taskId: String(task._id), orderNumber: task.orderNumber, kind, riderId, riderName, at: new Date().toISOString() };
  safeEmit(() => emitToAdmin(SOCKET_EVENTS.DELIVERY_TASK_EVENT, payload));
  if (riderId) safeEmit(() => emitToRider(riderId, SOCKET_EVENTS.DELIVERY_TASK_EVENT, payload));
}

/** Live push only — order room hears the new state, no history entry written. */
function announce(task: TaskLike, status: TaskStatus): void {
  const orderId = String(task.orderId);
  safeEmit(() =>
    emitToOrder(orderId, SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
      orderId,
      subOrderId: String(task._id),
      status,
      at: new Date().toISOString(),
    }),
  );
}

/** Live push + customer notification for a real status change (history already written by writeStatus). */
function notifyStatusChange(task: TaskLike, status: TaskStatus): void {
  announce(task, status);
  const title = STATUS_TITLES[status] ?? 'Delivery update';
  void notify(String(task.customerId), {
    type: 'order',
    title,
    body: task.orderNumber,
    link: `/order/${String(task.orderId)}`,
  });
}

const STATUS_TITLES: Record<string, string> = {
  accepted: 'Order confirmed by the store 🧾',
  preparing: 'Your order is being prepared 👨‍🍳',
  ready: 'Ready for pickup 📦',
  pickup_started: 'Your rider is heading to pick up your order 🛵',
  pickup_arrived: 'Your rider has reached the store 📍',
  picked_up: 'Your order has been picked up — on its way 📦',
  delivery_started: 'Out for delivery 🛵',
  delivery_arrived: 'Your rider has arrived 📍',
  delivered: 'Delivered ✅',
  cancelled: 'Delivery cancelled',
};
