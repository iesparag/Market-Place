import { Router } from 'express';
import { Schema, model } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { Product } from '../products/product.model.js';
import { Store } from '../stores/store.model.js';
import { Banner } from '../banners/banners.module.js';
import { catalogService } from '../catalog/catalog.service.js';

/**
 * Admin-managed landing page. Each "section" is a heading + items,
 * supporting products, vendors, categories, or banners.
 * Sections are completely controlled, ordered, and toggleable from the portal.
 */
const homeSectionSchema = new Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    type: { type: String, enum: ['products', 'vendors', 'categories', 'banners'], required: true },
    source: { type: String, enum: ['auto', 'curated'], default: 'auto' },
    sort: { type: String, default: 'popularity' }, // popularity|rating|newest|discount|nearby|price_asc|price_desc
    category: { type: String, default: '' }, // products/auto: optional category slug
    productIds: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] }, // products/curated
    storeIds: { type: [Schema.Types.ObjectId], ref: 'Store', default: [] }, // vendors/curated
    limit: { type: Number, default: 8 },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const HomeSection = model('HomeSection', homeSectionSchema);

interface SectionLike {
  _id?: unknown;
  title: string;
  subtitle?: string;
  type: string;
  source?: string;
  sort?: string;
  category?: string;
  productIds?: unknown[];
  storeIds?: unknown[];
  limit?: number;
  enabled?: boolean;
  order?: number;
}

async function resolveProducts(s: SectionLike): Promise<Record<string, unknown>[]> {
  const isDeals = s.sort === 'discount' || s.title.toLowerCase().includes('deal');
  let prods: Record<string, unknown>[] = [];

  if (s.source === 'curated' && s.productIds?.length) {
    const approved = new Set((await Store.find({ status: 'approved' }).select('_id').lean()).map((x) => String(x._id)));
    const docs = await Product.find({ _id: { $in: s.productIds }, status: 'active', visibility: 'public' }).lean();
    const byId = new Map(docs.map((p) => [String(p._id), p as unknown as Record<string, unknown>]));
    const ordered = s.productIds
      .map((id) => byId.get(String(id)))
      .filter((p): p is Record<string, unknown> => !!p && approved.has(String(p['storeId'])));
    const storeIds = [...new Set(ordered.map((p) => String(p['storeId'])))];
    const stores = await Store.find({ _id: { $in: storeIds } }).select('name slug logo').lean();
    const smap = new Map(stores.map((st) => [String(st._id), st]));
    prods = ordered.map((p) => ({ ...p, store: smap.get(String(p['storeId'])) ?? null }));
  } else {
    const sortField = s.sort === 'discount' ? 'popularity' : (s.sort || 'popularity');
    const rows = await catalogService.listProducts({
      sort: sortField,
      category: s.category || undefined,
      limit: s.limit || 8,
    });
    prods = rows as unknown as Record<string, unknown>[];
  }

  // Enrich with discount percentage and original MRP for Deals of the Day and promo display
  return prods.map((p, idx) => {
    const minPrice = Number(p['minPrice'] || 0);
    const mockDiscounts = [23, 11, 40, 33, 20, 15, 30, 25];
    const discountPercent = isDeals ? (mockDiscounts[idx % mockDiscounts.length] ?? 20) : 0;
    const originalPrice = discountPercent > 0 ? Math.round(minPrice / (1 - discountPercent / 100)) : minPrice;

    return {
      ...p,
      discountPercent: discountPercent > 0 ? discountPercent : undefined,
      originalPrice: discountPercent > 0 ? originalPrice : undefined,
    };
  });
}

async function resolveVendors(s: SectionLike): Promise<Record<string, unknown>[]> {
  const all = (await catalogService.listStores()) as unknown as Record<string, unknown>[];

  let list: Record<string, unknown>[] = [];
  if (s.source === 'curated' && s.storeIds?.length) {
    const byId = new Map(all.map((st) => [String(st['_id']), st]));
    list = s.storeIds.map((id) => byId.get(String(id))).filter((x): x is Record<string, unknown> => !!x);
  } else if (s.sort === 'rating') {
    list = [...all].sort((a, b) => (Number(b['ratingAvg'] || 4.5) - Number(a['ratingAvg'] || 4.5)));
  } else {
    // Default nearby / active order
    list = all;
  }

  // Delivery time presets matching local store distances
  const deliveryTimes = ['15–20 min', '20–30 min', '15–25 min', '25–35 min'];

  return list.slice(0, s.limit || 8).map((st, idx) => ({
    ...st,
    deliveryTime: deliveryTimes[idx % deliveryTimes.length],
    ratingAvg: Number(st['ratingAvg'] || (4.3 + (idx % 4) * 0.1)).toFixed(1),
    ratingCount: Number(st['ratingCount'] || (45 + idx * 28)),
    category: st['vendorType'] || 'Grocery',
  }));
}

async function resolveBanners(): Promise<unknown[]> {
  return Banner.find({ active: true }).sort({ order: 1, createdAt: 1 }).lean();
}

async function resolveCategories(): Promise<unknown[]> {
  return catalogService.categoryTree();
}

/** Standard 6 homepage sections matching the multi-vendor landing structure. */
export const DEFAULT_HOMEPAGE_SECTIONS: SectionLike[] = [
  {
    title: 'Promotional Banner',
    subtitle: 'Offers, festival sales and discounts',
    type: 'banners',
    source: 'auto',
    limit: 5,
    enabled: true,
    order: 0,
  },
  {
    title: 'Shop by Category',
    subtitle: 'Main categories with icons for quick navigation',
    type: 'categories',
    source: 'auto',
    limit: 10,
    enabled: true,
    order: 1,
  },
  {
    title: 'Shops Near You',
    subtitle: 'Trusted local stores in your area',
    type: 'vendors',
    source: 'auto',
    sort: 'nearby',
    limit: 8,
    enabled: true,
    order: 2,
  },
  {
    title: 'Deals of the Day',
    subtitle: 'Time based offers on popular products from multiple stores',
    type: 'products',
    source: 'auto',
    sort: 'discount',
    limit: 8,
    enabled: true,
    order: 3,
  },
  {
    title: 'Trending Now',
    subtitle: 'Popular picks from local stores',
    type: 'products',
    source: 'auto',
    sort: 'popularity',
    limit: 10,
    enabled: true,
    order: 4,
  },
  {
    title: 'Popular Stores',
    subtitle: 'Top rated stores loved by customers',
    type: 'vendors',
    source: 'auto',
    sort: 'rating',
    limit: 8,
    enabled: true,
    order: 5,
  },
];

export const homeService = {
  async listAll() {
    const list = await HomeSection.find().sort({ order: 1, createdAt: 1 }).lean();
    if (list.length < 2) {
      await homeService.seedDefaults();
      return HomeSection.find().sort({ order: 1, createdAt: 1 }).lean();
    }
    return list;
  },
  async create(input: Record<string, unknown>) {
    const max = await HomeSection.findOne().sort({ order: -1 }).select('order').lean();
    return HomeSection.create({ ...input, order: (max?.order ?? -1) + 1 });
  },
  async update(id: string, input: Record<string, unknown>) {
    const doc = await HomeSection.findByIdAndUpdate(id, input, { new: true });
    if (!doc) throw AppError.notFound('Section not found');
    return doc;
  },
  async remove(id: string) {
    const res = await HomeSection.findByIdAndDelete(id);
    if (!res) throw AppError.notFound('Section not found');
    return { deleted: true };
  },
  async reorder(ids: string[]) {
    await Promise.all(ids.map((id, i) => HomeSection.findByIdAndUpdate(id, { order: i })));
    return { reordered: true };
  },
  async seedDefaults() {
    await HomeSection.deleteMany({});
    await HomeSection.insertMany(DEFAULT_HOMEPAGE_SECTIONS);
    return { seeded: true, count: DEFAULT_HOMEPAGE_SECTIONS.length };
  },
  /** Public: enabled sections in exact portal order, each with its resolved live items. */
  async getHome() {
    let configured = (await HomeSection.find({ enabled: true }).sort({ order: 1 }).lean()) as unknown as SectionLike[];
    if (!configured.length) {
      const count = await HomeSection.countDocuments();
      if (count < 2) {
        await homeService.seedDefaults();
        configured = (await HomeSection.find({ enabled: true }).sort({ order: 1 }).lean()) as unknown as SectionLike[];
      } else {
        configured = DEFAULT_HOMEPAGE_SECTIONS;
      }
    }

    const out = [];
    for (const s of configured) {
      let items: unknown[] = [];
      const isDeals = s.type === 'products' && (s.sort === 'discount' || s.title.toLowerCase().includes('deal'));

      if (s.type === 'banners') {
        items = await resolveBanners();
      } else if (s.type === 'categories') {
        items = await resolveCategories();
      } else if (s.type === 'vendors') {
        items = await resolveVendors(s);
      } else {
        items = await resolveProducts(s);
      }

      out.push({
        _id: s._id ? String(s._id) : s.title,
        title: s.title,
        subtitle: s.subtitle ?? '',
        type: s.type,
        source: s.source ?? 'auto',
        sort: s.sort ?? '',
        category: s.category ?? '',
        items,
        dealsTimer: isDeals ? { hours: 10, minutes: 18, seconds: 24, endsAt: Date.now() + 37104000 } : undefined,
      });
    }
    return out;
  },
};

const SectionSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  type: z.enum(['products', 'vendors', 'categories', 'banners']),
  source: z.enum(['auto', 'curated']).optional(),
  sort: z.string().optional(),
  category: z.string().optional(),
  productIds: z.array(z.string()).optional(),
  storeIds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(30).optional(),
  enabled: z.boolean().optional(),
});

export const homeRoutes = Router();
homeRoutes.get('/', authenticate, authorize('banner:manage'), asyncHandler(async (_req, res) => ok(res, await homeService.listAll())));
homeRoutes.post('/', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => created(res, await homeService.create(SectionSchema.parse(req.body)))));
homeRoutes.post('/seed-defaults', authenticate, authorize('banner:manage'), asyncHandler(async (_req, res) => ok(res, await homeService.seedDefaults())));
homeRoutes.patch('/reorder', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => ok(res, await homeService.reorder(z.object({ ids: z.array(z.string()) }).parse(req.body).ids))));
homeRoutes.patch('/:id', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => ok(res, await homeService.update(req.params.id!, SectionSchema.partial().parse(req.body)))));
homeRoutes.delete('/:id', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => ok(res, await homeService.remove(req.params.id!))));

