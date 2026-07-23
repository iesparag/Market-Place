import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { SOCKET_EVENTS, Role } from '@app/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { emitToUser, safeEmit } from '../../realtime/emitters.js';
import { User } from '../auth/user.model.js';
import { pushProvider } from '../../providers/push/index.js';

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, default: 'info' }, // order | payment | promo | info
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' }, // where clicking it should navigate
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const Notification = model('Notification', notificationSchema);

// Device push tokens (for the future Flutter app → FCM). Registered by the mobile client.
const deviceTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, default: 'android' }, // android | ios | web
  },
  { timestamps: true },
);
export const DeviceToken = model('DeviceToken', deviceTokenSchema);

/** Create + push a per-user notification. Safe to call from any service (fire-and-forget socket). */
export async function notify(
  userId: string,
  data: { type?: string; title: string; body?: string; link?: string },
): Promise<void> {
  const doc = await Notification.create({ userId, ...data });
  safeEmit(() =>
    emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_NEW, {
      id: String(doc._id),
      title: doc.title,
      body: doc.body ?? '',
      at: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    }),
  );
}

export const notificationsRoutes = Router();
notificationsRoutes.use(authenticate);

// Recent notifications for the signed-in user.
notificationsRoutes.get('/', asyncHandler(async (req, res) => {
  const items = await Notification.find({ userId: req.user!.id })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();
  ok(res, items.map((n) => ({
    _id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, read: n.read, createdAt: n.createdAt,
  })));
}));

notificationsRoutes.get('/unread-count', asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ userId: req.user!.id, read: false });
  ok(res, { count });
}));

notificationsRoutes.post('/:id/read', asyncHandler(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, userId: req.user!.id }, { read: true });
  ok(res, { read: true });
}));

notificationsRoutes.post('/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user!.id, read: false }, { read: true });
  ok(res, { read: true });
}));

// Mobile client registers its FCM device token (future Flutter app).
notificationsRoutes.post('/register-device', asyncHandler(async (req, res) => {
  const token = String(req.body.token ?? '');
  if (!token) throw AppError.badRequest('NO_TOKEN', 'Device token required');
  await DeviceToken.updateOne(
    { token },
    { $set: { userId: req.user!.id, platform: req.body.platform ?? 'android' } },
    { upsert: true },
  );
  ok(res, { registered: true });
}));

/** Admin broadcast → in-app notification (bell) + live socket + FCM push (stub) to an audience. */
notificationsRoutes.post('/broadcast', authorize('notification:manage'), asyncHandler(async (req, res) => {
  const title = String(req.body.title ?? '').trim();
  if (!title) throw AppError.badRequest('NO_TITLE', 'Title is required');
  const body = String(req.body.body ?? '');
  const link = String(req.body.link ?? '');
  const audience = req.body.audience === 'all' ? 'all' : 'customers';

  const filter = audience === 'all' ? {} : { role: Role.CUSTOMER };
  const users = await User.find(filter).select('_id').lean();

  // Bell notification + live push for every target.
  for (const u of users) await notify(String(u._id), { type: 'promo', title, body, link });

  // Future Flutter app: send FCM push to their registered devices (stub until FCM is wired).
  const tokens = (await DeviceToken.find({ userId: { $in: users.map((u) => u._id) } }).select('token').lean()).map((t) => t.token);
  void pushProvider.send({ tokens, title, body, data: link ? { link } : {} });

  ok(res, { audience, recipients: users.length, devices: tokens.length });
}));
