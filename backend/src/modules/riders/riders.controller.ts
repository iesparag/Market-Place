import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../common/apiResponse.js';
import { ridersService } from './riders.service.js';
import { deliveryTasksService } from '../delivery/delivery-tasks.service.js';
import { autoAssignService } from '../delivery/auto-assign.service.js';
import { RiderDeviceToken } from './rider-push.js';
import { AppError } from '../../common/AppError.js';

const CreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  password: z.string().min(6),
  vehicleType: z.enum(['bike', 'scooter', 'bicycle', 'car', 'van']).optional(),
});
const UpdateSchema = z.object({
  name: z.string().optional(),
  vehicleType: z.enum(['bike', 'scooter', 'bicycle', 'car', 'van']).optional(),
  isActive: z.boolean().optional(),
});
const LoginSchema = z.object({ phone: z.string().min(6), password: z.string().min(1) });
const StatusSchema = z.object({ status: z.enum(['offline', 'available', 'busy']) });
const LocationSchema = z.object({ lat: z.number(), lng: z.number() });
const RegisterDeviceSchema = z.object({ token: z.string().min(1), platform: z.enum(['android', 'ios']).optional() });
const TaskStatusSchema = z.object({
  status: z.enum(['pickup_started', 'pickup_arrived', 'picked_up', 'delivery_started', 'delivery_arrived', 'delivered']),
});

export const ridersController = {
  // ── admin/vendor management ────────────────────────────────────────────
  async create(req: Request, res: Response) {
    const input = CreateSchema.parse(req.body);
    created(res, await ridersService.create(input));
  },
  async list(req: Request, res: Response) {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    ok(res, await ridersService.listForAdmin({ status }));
  },
  async update(req: Request, res: Response) {
    const patch = UpdateSchema.parse(req.body);
    ok(res, await ridersService.updateByAdmin(req.params.id!, patch));
  },

  // ── public ──────────────────────────────────────────────────────────────
  async login(req: Request, res: Response) {
    const { phone, password } = LoginSchema.parse(req.body);
    ok(res, await ridersService.login(phone, password));
  },

  // ── rider self-service (authenticateRider) ─────────────────────────────
  async me(req: Request, res: Response) {
    ok(res, await ridersService.me(req.rider!.riderId));
  },
  async setStatus(req: Request, res: Response) {
    const { status } = StatusSchema.parse(req.body);
    ok(res, await ridersService.setStatus(req.rider!.riderId, status));
  },
  async updateLocation(req: Request, res: Response) {
    const { lat, lng } = LocationSchema.parse(req.body);
    ok(res, await ridersService.updateLocation(req.rider!.riderId, lat, lng));
  },
  async myTasks(req: Request, res: Response) {
    ok(res, await deliveryTasksService.listForRider(req.rider!.riderId));
  },
  async myOffers(req: Request, res: Response) {
    ok(res, await deliveryTasksService.listOffersForRider(req.rider!.riderId));
  },
  async acceptOffer(req: Request, res: Response) {
    ok(res, await autoAssignService.acceptOffer(req.params.id!, req.rider!.riderId));
  },
  async declineOffer(req: Request, res: Response) {
    await autoAssignService.declineOffer(req.params.id!, req.rider!.riderId);
    ok(res, { declined: true });
  },
  async registerDevice(req: Request, res: Response) {
    const { token, platform } = RegisterDeviceSchema.parse(req.body);
    if (!token) throw AppError.badRequest('NO_TOKEN', 'Device token required');
    await RiderDeviceToken.updateOne(
      { token },
      { $set: { riderId: req.rider!.riderId, platform: platform ?? 'android' } },
      { upsert: true },
    );
    ok(res, { registered: true });
  },
  async updateTaskStatus(req: Request, res: Response) {
    const { status } = TaskStatusSchema.parse(req.body);
    ok(
      res,
      await deliveryTasksService.updateStatus(req.params.id!, status, {
        kind: 'rider',
        riderId: req.rider!.riderId,
      }),
    );
  },
};
