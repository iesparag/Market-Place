import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { User } from '../auth/user.model.js';
import { Store } from '../stores/store.model.js';
import { Category } from '../categories/category.model.js';
import { Product } from '../products/product.model.js';
import { Wishlist, StoreFavourite } from '../wishlist/wishlist.module.js';
import { Cart } from '../cart/cart.module.js';
import { notify } from '../notifications/notifications.module.js';
import { whatsappProvider } from '../../providers/whatsapp/index.js';
import { WhatsAppTemplate } from '../whatsapp/whatsapp.module.js';

/**
 * Generalized marketing-campaign audience targeting — same send mechanics as the
 * cart-recovery campaign (`cart.module.ts`'s `/recovery-campaign`, left in place for
 * that one specific flow), but the audience isn't hardcoded to "people with a cart."
 * An admin picks a segment, previews its size, composes the message/coupon/template,
 * and sends — nothing here fires on its own. This is deliberately NOT an automatic
 * "new vendor approved → message matching customers" trigger: that would take control
 * away from the admin over exactly who gets messaged and what the copy says. Instead,
 * `favourited_vendor_type` / `wishlist_category` / `store_favouriters` let an admin do
 * that same thing in two clicks, on demand, reviewing the audience count first.
 */
const SegmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all_customers') }),
  z.object({ type: z.literal('explicit'), userIds: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('cart_abandoners') }),
  z.object({
    type: z.literal('favourited_vendor_type'),
    vendorType: z.enum(['food', 'grocery', 'fashion', 'generic', 'integration']),
  }),
  z.object({ type: z.literal('wishlist_category'), categorySlug: z.string().min(1) }),
  z.object({ type: z.literal('store_favouriters'), storeId: z.string().min(1) }),
]);
type Segment = z.infer<typeof SegmentSchema>;

async function resolveSegmentUserIds(segment: Segment): Promise<string[]> {
  switch (segment.type) {
    case 'all_customers': {
      const ids = await User.find({ role: 'customer' }).distinct('_id');
      return ids.map(String);
    }
    case 'explicit':
      return segment.userIds;
    case 'cart_abandoners': {
      const ids = await Cart.find({ 'items.0': { $exists: true } }).distinct('userId');
      return ids.map(String);
    }
    case 'favourited_vendor_type': {
      const storeIds = await Store.find({ status: 'approved', vendorType: segment.vendorType }).distinct('_id');
      const ids = await StoreFavourite.find({ storeId: { $in: storeIds } }).distinct('userId');
      return ids.map(String);
    }
    case 'wishlist_category': {
      const cat = await Category.findOne({ slug: segment.categorySlug }).select('_id').lean();
      if (!cat) return [];
      const productIds = await Product.find({ categoryId: cat._id }).distinct('_id');
      const ids = await Wishlist.find({ productId: { $in: productIds } }).distinct('userId');
      return ids.map(String);
    }
    case 'store_favouriters': {
      const ids = await StoreFavourite.find({ storeId: segment.storeId }).distinct('userId');
      return ids.map(String);
    }
  }
}

const SendSchema = z.object({
  segment: SegmentSchema,
  title: z.string().min(1).default('📢 New at Marketplace'),
  body: z.string().default(''),
  couponCode: z.string().optional(),
  image: z.string().optional(),
  channels: z.array(z.enum(['push', 'whatsapp'])).min(1).default(['push']),
  whatsappTemplateName: z.string().optional(), // must be an 'approved' WhatsAppTemplate
  layout: z.string().optional(),
  products: z.array(z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    price: z.number(),
    originalPrice: z.number().optional(),
    image: z.string().optional(),
  })).optional(),
  storeId: z.string().optional(),
  storeSlug: z.string().optional(),
  storeName: z.string().optional(),
  storeLogo: z.string().optional(),
  link: z.string().optional(),
  actionText: z.string().optional(),
});

export const campaignsRoutes = Router();
campaignsRoutes.use(authenticate, authorize('notification:manage'));

/** Lets the admin see "this will reach N customers" before committing to a send. */
campaignsRoutes.post('/audience-count', asyncHandler(async (req, res) => {
  const segment = SegmentSchema.parse(req.body.segment);
  const ids = await resolveSegmentUserIds(segment);
  ok(res, { count: ids.length });
}));

campaignsRoutes.post('/send', asyncHandler(async (req, res) => {
  const input = SendSchema.parse(req.body);
  const userIds = await resolveSegmentUserIds(input.segment);
  if (!userIds.length) {
    ok(res, { targeted: 0, pushSent: 0, whatsappSent: 0 });
    return;
  }

  const users = await User.find({ _id: { $in: userIds } }).select('name phone whatsappOptIn').lean();

  let template: InstanceType<typeof WhatsAppTemplate> | null = null;
  if (input.channels.includes('whatsapp') && input.whatsappTemplateName) {
    template = await WhatsAppTemplate.findOne({ name: input.whatsappTemplateName, status: 'approved' });
  }

  const firstProd = input.products && input.products.length ? input.products[0] : undefined;
  const defaultLink = input.link || (input.storeSlug ? `/store/${input.storeSlug}` : (firstProd ? `/p/${firstProd.slug}` : '/'));
  const heroImage = input.image || firstProd?.image;

  let pushSent = 0;
  let whatsappSent = 0;
  for (const user of users) {
    const body = input.body ||
      (input.couponCode
        ? `We've got something new for you — use ${input.couponCode} for a discount.`
        : "We've got something new for you — check it out.");

    if (input.channels.includes('push')) {
      await notify(String(user._id), {
        type: 'promo',
        title: input.title,
        body,
        link: defaultLink,
        image: heroImage,
        layout: input.layout ?? 'standard',
        products: input.products,
        storeId: input.storeId,
        storeSlug: input.storeSlug,
        storeName: input.storeName,
        storeLogo: input.storeLogo,
        couponCode: input.couponCode,
        actionText: input.actionText ?? 'SHOP NOW',
      });
      pushSent += 1;
    }
    // WhatsApp is opt-in only (User.whatsappOptIn — Meta policy on unsolicited business
    // messages); a user with no phone or no consent is silently skipped on this channel,
    // never on push.
    if (input.channels.includes('whatsapp') && template && user.phone && user.whatsappOptIn) {
      const result = await whatsappProvider.sendTemplate({
        to: user.phone,
        templateName: template.name,
        languageCode: template.language,
        bodyParams: Array.from({ length: template.variableCount }, (_, i) =>
          i === 0 ? (user.name || 'there') : (input.couponCode ?? '')),
        headerImageUrl: template.hasImageHeader ? heroImage : undefined,
      });
      if (result.sent) whatsappSent += 1;
    }
  }

  ok(res, { targeted: userIds.length, pushSent, whatsappSent });
}));
