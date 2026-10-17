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
    subtitle: { type: String, default: '' },
    body: { type: String, default: '' },
    link: { type: String, default: '' }, // where clicking it should navigate
    image: { type: String, default: '' }, // hero image — product/vendor photo or campaign art
    actionText: { type: String, default: '' },
    actionLink: { type: String, default: '' },
    layout: { type: String, default: 'standard' }, // standard | big_picture | product_showcase | store_spotlight
    products: [
      {
        id: { type: String },
        title: { type: String },
        slug: { type: String },
        price: { type: Number },
        originalPrice: { type: Number },
        image: { type: String },
      },
    ],
    storeId: { type: String, default: '' },
    storeSlug: { type: String, default: '' },
    storeName: { type: String, default: '' },
    storeLogo: { type: String, default: '' },
    couponCode: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const Notification = model('Notification', notificationSchema);

const broadcastCampaignSchema = new Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    body: { type: String, default: '' },
    image: { type: String, default: '' },
    link: { type: String, default: '' },
    actionText: { type: String, default: 'SHOP NOW' },
    layout: { type: String, default: 'standard' },
    products: [
      {
        id: { type: String },
        title: { type: String },
        slug: { type: String },
        price: { type: Number },
        originalPrice: { type: Number },
        image: { type: String },
      },
    ],
    storeId: { type: String, default: '' },
    storeSlug: { type: String, default: '' },
    storeName: { type: String, default: '' },
    storeLogo: { type: String, default: '' },
    couponCode: { type: String, default: '' },
    audience: { type: String, default: 'customers' },
    targetCity: { type: String, default: '' },
    recipientsCount: { type: Number, default: 0 },
    devicesCount: { type: Number, default: 0 },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
export type BroadcastCampaignDoc = InferSchemaType<typeof broadcastCampaignSchema>;
export const BroadcastCampaign = model('BroadcastCampaign', broadcastCampaignSchema);

// Device push tokens (for Flutter apps → FCM). Registered by mobile clients.
const deviceTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, default: 'android' }, // android | ios | web
  },
  { timestamps: true },
);
export const DeviceToken = model('DeviceToken', deviceTokenSchema);

/**
 * Create + push a per-user notification. Safe to call from any service (fire-and-forget
 * socket + FCM).
 */
export async function notify(
  userId: string,
  data: {
    type?: string;
    title: string;
    subtitle?: string;
    body?: string;
    link?: string;
    image?: string;
    actionText?: string;
    actionLink?: string;
    priority?: 'high' | 'normal';
    layout?: string;
    products?: Array<{ id: string; title: string; slug: string; price: number; originalPrice?: number; image?: string }>;
    storeId?: string;
    storeSlug?: string;
    storeName?: string;
    storeLogo?: string;
    couponCode?: string;
  },
): Promise<void> {
  const firstProd = data.products && data.products.length ? data.products[0] : undefined;

  // A native Android/iOS notification can only ever show ONE image — there is no
  // multi-image "carousel" notification type (the admin portal's carousel preview is
  // a UI mockup with no native equivalent — neither push nor this backend's WhatsApp
  // integration, which only sends single-image template messages, can deliver a real
  // carousel today). So when products are attached, prefer a REAL product photo over
  // whatever generic campaign-art `image` was left on the form.
  //
  // BUT only if it's actually a publicly-fetchable https:// URL. A locally-uploaded
  // product image is `${PUBLIC_URL}/uploads/...` (see media.module.ts) — if PUBLIC_URL
  // is still its localhost default (env.ts) because it was never set on the deployed
  // backend, that URL is unreachable from a real device and FCM silently fails to
  // render ANY image (not even a fallback) rather than erroring visibly. Skip a
  // non-public-looking image rather than shipping a guaranteed-broken notification.
  const isPubliclyFetchable = (url?: string) => !!url && /^https:\/\//.test(url) && !/localhost|127\.0\.0\.1/.test(url);
  const heroImage = [firstProd?.image, data.image].find(isPubliclyFetchable);

  // The image can only ever show ONE product — so when 2+ are attached, make the TEXT
  // carry the rest. Appended (not replacing the admin's own copy) so a custom
  // marketing line is preserved, with the actual attached products listed after it —
  // the closest the notification content can get to "matches what I configured"
  // within push's one-image-only ceiling. Computed here (not just for the FCM payload
  // below) so the in-app notification bell shows the same enriched text, not a
  // mismatched plain version.
  let body = data.body ?? '';
  if (data.products && data.products.length > 1) {
    // NOTE: data.products[].price is already in whole rupees here, NOT paise — the
    // admin portal's productMapFn (announcements.page.ts) converts minPrice/variant
    // price out of minor units before ever attaching a product to a campaign. Don't
    // divide by 100 again.
    const rest = data.products.slice(1, 4); // first is already the hero image; cap the list so it doesn't get unreadable
    const list = rest.map((p) => `${p.title} ₹${p.price}`).join(', ');
    const more = data.products.length > 4 ? ` +${data.products.length - 4} more` : '';
    const suffix = `🛍️ ${data.products.length} items: ${firstProd!.title} ₹${firstProd!.price}, ${list}${more}`;
    body = body ? `${body}\n${suffix}` : suffix;
  }

  const doc = await Notification.create({ userId, ...data, body, image: heroImage ?? data.image });
  safeEmit(() =>
    emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_NEW, {
      id: String(doc._id),
      title: doc.title,
      body: doc.body ?? '',
      image: doc.image ?? '',
      at: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    }),
  );
  const tokens = (await DeviceToken.find({ userId }).select('token').lean()).map((t) => t.token);
  if (tokens.length) {
    // Tapping a product-showcase notification should land on exactly the attached
    // products, "at the top" — the closest a single-image notification can get to the
    // carousel the admin configured. Overrides whatever `link` the composer defaulted
    // to; a single product goes straight to its page, multiple go to a pinned-ids
    // catalog view (see catalog.service.ts's `ids` query / CatalogScreen's `products`
    // param) that shows exactly those products, in that order, before anything else.
    const derivedLink =
      data.products && data.products.length === 1
        ? `/p/${data.products[0]!.slug}`
        : data.products && data.products.length > 1
          ? `/catalog?products=${data.products.map((p) => p.id).join(',')}`
          : undefined;
    const link = derivedLink ?? data.link ?? '/';

    void pushProvider.send({
      tokens,
      title: data.title,
      subtitle: data.subtitle,
      body,
      imageUrl: heroImage,
      actionText: data.actionText,
      actionLink: data.actionLink || link,
      priority: data.priority ?? 'high',
      data: {
        link,
        actionLink: data.actionLink ?? link,
        actionText: data.actionText ?? 'SHOP NOW',
        layout: data.layout ?? 'standard',
        products: data.products ? JSON.stringify(data.products) : '[]',
        storeSlug: data.storeSlug ?? '',
        storeName: data.storeName ?? '',
        couponCode: data.couponCode ?? '',
      },
    });
  }
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
    _id: String(n._id),
    type: n.type,
    title: n.title,
    subtitle: n.subtitle,
    body: n.body,
    link: n.link,
    image: n.image,
    layout: n.layout ?? 'standard',
    products: n.products ?? [],
    storeSlug: n.storeSlug ?? '',
    storeName: n.storeName ?? '',
    storeLogo: n.storeLogo ?? '',
    couponCode: n.couponCode ?? '',
    read: n.read,
    createdAt: n.createdAt,
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

/** List sent broadcast campaigns (Admin push history) */
notificationsRoutes.get('/campaigns', authorize('notification:manage'), asyncHandler(async (_req, res) => {
  const campaigns = await BroadcastCampaign.find().sort({ createdAt: -1 }).limit(30).lean();
  ok(res, campaigns);
}));

/** Test push — send directly to the logged in admin's devices to preview look & feel */
notificationsRoutes.post('/test', authorize('notification:manage'), asyncHandler(async (req, res) => {
  const title = String(req.body.title ?? '').trim() || '🎉 Test Push Notification';
  const subtitle = String(req.body.subtitle ?? '');
  const body = String(req.body.body ?? '') || 'This is a test notification from Marketplace Admin.';
  const link = String(req.body.link ?? '/');
  const image = String(req.body.image ?? '');
  const actionText = String(req.body.actionText ?? 'SHOP NOW');
  const layout = String(req.body.layout ?? 'standard');
  const products = Array.isArray(req.body.products) ? req.body.products : [];
  const storeId = String(req.body.storeId ?? '');
  const storeSlug = String(req.body.storeSlug ?? '');
  const storeName = String(req.body.storeName ?? '');
  const storeLogo = String(req.body.storeLogo ?? '');
  const couponCode = String(req.body.couponCode ?? '');

  await notify(req.user!.id, {
    type: 'promo',
    title,
    subtitle,
    body,
    link,
    image,
    actionText,
    actionLink: link,
    priority: 'high',
    layout,
    products,
    storeId,
    storeSlug,
    storeName,
    storeLogo,
    couponCode,
  });

  const devices = await DeviceToken.countDocuments({ userId: req.user!.id });
  ok(res, { success: true, devices, message: `Test push sent to your account (${devices} device(s) registered)` });
}));

/** Admin broadcast → in-app notification (bell) + live socket + FCM push to an audience. */
notificationsRoutes.post('/broadcast', authorize('notification:manage'), asyncHandler(async (req, res) => {
  const title = String(req.body.title ?? '').trim();
  if (!title) throw AppError.badRequest('NO_TITLE', 'Title is required');
  const subtitle = String(req.body.subtitle ?? '');
  const body = String(req.body.body ?? '');
  const link = String(req.body.link ?? '');
  const image = String(req.body.image ?? '');
  const actionText = String(req.body.actionText ?? 'SHOP NOW');
  const actionLink = String(req.body.actionLink ?? link);
  const audience = String(req.body.audience ?? 'customers');
  const targetCity = String(req.body.targetCity ?? '').trim();
  const layout = String(req.body.layout ?? 'standard');
  const products = Array.isArray(req.body.products) ? req.body.products : [];
  const storeId = String(req.body.storeId ?? '');
  const storeSlug = String(req.body.storeSlug ?? '');
  const storeName = String(req.body.storeName ?? '');
  const storeLogo = String(req.body.storeLogo ?? '');
  const couponCode = String(req.body.couponCode ?? '');

  let filter: Record<string, unknown> = {};
  if (audience === 'customers') filter = { role: Role.CUSTOMER };
  else if (audience === 'vendors') filter = { role: { $in: [Role.VENDOR, Role.VENDOR_STAFF] } };
  else if (audience === 'all') filter = {};

  const users = await User.find(filter).select('_id').lean();

  // Bell notification + live socket + FCM push for every target — notify() does all three.
  for (const u of users) {
    await notify(String(u._id), {
      type: 'promo',
      title,
      subtitle,
      body,
      link,
      image,
      actionText,
      actionLink,
      priority: 'high',
      layout,
      products,
      storeId,
      storeSlug,
      storeName,
      storeLogo,
      couponCode,
    });
  }

  const devices = await DeviceToken.countDocuments({ userId: { $in: users.map((u) => u._id) } });

  // Record campaign history
  await BroadcastCampaign.create({
    title,
    subtitle,
    body,
    image,
    link,
    actionText,
    layout,
    products,
    storeId,
    storeSlug,
    storeName,
    storeLogo,
    couponCode,
    audience,
    targetCity: targetCity || undefined,
    recipientsCount: users.length,
    devicesCount: devices,
    sentBy: req.user!.id,
  });

  ok(res, { audience, targetCity, recipients: users.length, devices });
}));

/**
 * Admin send → targeted at specific users
 */
notificationsRoutes.post('/send', authorize('notification:manage'), asyncHandler(async (req, res) => {
  const title = String(req.body.title ?? '').trim();
  if (!title) throw AppError.badRequest('NO_TITLE', 'Title is required');
  const userIds = Array.isArray(req.body.userIds) ? req.body.userIds.map(String) : [];
  if (!userIds.length) throw AppError.badRequest('NO_RECIPIENTS', 'Select at least one recipient');
  const subtitle = String(req.body.subtitle ?? '');
  const body = String(req.body.body ?? '');
  const link = String(req.body.link ?? '');
  const image = String(req.body.image ?? '');
  const actionText = String(req.body.actionText ?? 'SHOP NOW');
  const actionLink = String(req.body.actionLink ?? link);
  const type = String(req.body.type ?? 'promo');
  // Previously dropped entirely on this route (unlike /broadcast and /test) — a
  // "product showcase" send to specific recipients silently lost which products were
  // attached, so notify() had nothing to derive the hero image / tap-target from.
  const layout = String(req.body.layout ?? 'standard');
  const products = Array.isArray(req.body.products) ? req.body.products : [];
  const storeId = String(req.body.storeId ?? '');
  const storeSlug = String(req.body.storeSlug ?? '');
  const storeName = String(req.body.storeName ?? '');
  const storeLogo = String(req.body.storeLogo ?? '');
  const couponCode = String(req.body.couponCode ?? '');

  for (const userId of userIds) {
    await notify(userId, {
      type,
      title,
      subtitle,
      body,
      link,
      image,
      actionText,
      actionLink,
      priority: 'high',
      layout,
      products,
      storeId,
      storeSlug,
      storeName,
      storeLogo,
      couponCode,
    });
  }

  const devices = await DeviceToken.countDocuments({ userId: { $in: userIds } });
  ok(res, { recipients: userIds.length, devices });
}));
