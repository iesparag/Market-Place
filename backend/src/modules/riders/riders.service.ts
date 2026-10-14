import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SOCKET_EVENTS } from '@app/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../common/AppError.js';
import { emitToOrder, safeEmit } from '../../realtime/emitters.js';
import { Rider } from './rider.model.js';
import { DeliveryTask } from '../delivery/delivery-task.model.js';
import type { RiderAuthPayload } from './rider.types.js';

function signRiderToken(riderId: string, tenantId: string): string {
  const payload: RiderAuthPayload = { riderId, tenantId, type: 'rider' };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}

export const ridersService = {
  /** Admin/vendor onboards a rider — portal-controlled, riders don't self-register. */
  async create(input: { name: string; phone: string; password: string; vehicleType?: string; tenantId?: string }) {
    const exists = await Rider.findOne({ phone: input.phone }).lean();
    if (exists) throw AppError.conflict('A rider with this phone already exists');
    const passwordHash = await bcrypt.hash(input.password, 10);
    const rider = await Rider.create({
      name: input.name,
      phone: input.phone,
      passwordHash,
      vehicleType: input.vehicleType,
      tenantId: input.tenantId ?? 'platform',
    });
    return toPublic(rider);
  },

  async login(phone: string, password: string) {
    const rider = await Rider.findOne({ phone });
    if (!rider || !rider.isActive) throw AppError.unauthenticated('Invalid credentials');
    const match = await bcrypt.compare(password, rider.passwordHash);
    if (!match) throw AppError.unauthenticated('Invalid credentials');
    const token = signRiderToken(String(rider._id), rider.tenantId ?? 'platform');
    return { token, rider: toPublic(rider) };
  },

  async me(riderId: string) {
    const rider = await Rider.findById(riderId).lean();
    if (!rider) throw AppError.notFound('Rider not found');
    return toPublic(rider);
  },

  async listForAdmin(filter: { status?: string; tenantId?: string } = {}) {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.tenantId) query.tenantId = filter.tenantId;
    const riders = await Rider.find(query).sort({ createdAt: -1 }).lean();
    return riders.map(toPublic);
  },

  async updateByAdmin(id: string, patch: { name?: string; vehicleType?: string; isActive?: boolean }) {
    const rider = await Rider.findByIdAndUpdate(id, patch, { new: true });
    if (!rider) throw AppError.notFound('Rider not found');
    return toPublic(rider);
  },

  /** Rider toggles their own online/offline/available state. */
  async setStatus(riderId: string, status: 'offline' | 'available' | 'busy') {
    const rider = await Rider.findByIdAndUpdate(riderId, { status }, { new: true });
    if (!rider) throw AppError.notFound('Rider not found');
    return toPublic(rider);
  },

  /** Rider's phone posts a location fix — stored + broadcast to any order room they're actively delivering. */
  async updateLocation(riderId: string, lat: number, lng: number) {
    const at = new Date();
    await Rider.updateOne({ _id: riderId }, { currentLocation: { lat, lng, at } });

    const activeTasks = await DeliveryTask.find({ riderId, status: 'shipped' }).select('orderId').lean();
    for (const task of activeTasks) {
      safeEmit(() =>
        emitToOrder(String(task.orderId), SOCKET_EVENTS.DELIVERY_LOCATION, {
          orderId: String(task.orderId),
          lat,
          lng,
          at: at.toISOString(),
        }),
      );
    }
    return { updated: true };
  },
};

/** Never return `passwordHash` — this is the only shape any route should send out. */
function toPublic(rider: {
  _id: unknown;
  name: string;
  phone: string;
  vehicleType?: string | null;
  status: string;
  rating?: number | null;
  activeTaskCount?: number | null;
  totalDeliveries?: number | null;
  isActive?: boolean | null;
  tenantId?: string | null;
  currentLocation?: { lat?: number | null; lng?: number | null; at?: Date | null } | null;
}) {
  return {
    id: String(rider._id),
    name: rider.name,
    phone: rider.phone,
    vehicleType: rider.vehicleType,
    status: rider.status,
    rating: rider.rating,
    activeTaskCount: rider.activeTaskCount,
    totalDeliveries: rider.totalDeliveries,
    isActive: rider.isActive,
    tenantId: rider.tenantId,
    currentLocation: rider.currentLocation,
  };
}
