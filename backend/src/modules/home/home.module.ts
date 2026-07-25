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
import { catalogService } from '../catalog/catalog.service.js';

/**
 * Admin-managed landing page. Each "section" is a heading + a strip of products or vendors,
 * either auto (a rule) or curated (a hand-picked list). Sections are ordered and toggleable.
 */
const homeSectionSchema = new Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    type: { type: String, enum: ['products', 'vendors'], required: true },
    source: { type: String, enum: ['auto', 'curated'], default: 'auto' },
    sort: { type: String, default: 'popularity' }, // products/auto: popularity|rating|newest|price_asc|price_desc
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
  _id?: unknown; title: string; subtitle?: string; type: string; source?: string;
  sort?: string; category?: string; productIds?: unknown[]; storeIds?: unknown[]; limit?: number;
}

async function resolveProducts(s: SectionLike): Promise<unknown[]> {
  if (s.source === 'curated' && s.productIds?.length) {
    const approved = new Set((await Store.find({ status: 'approved' }).select('_id').lean()).map((x) => String(x._id)));
    const prods = await Product.find({ _id: { $in: s.productIds }, status: 'active', visibility: 'public' }).lean();
    const byId = new Map(prods.map((p) => [String(p._id), p]));
    const ordered = s.productIds
      .map((id) => byId.get(String(id)))
      .filter((p): p is NonNullable<typeof p> => !!p && approved.has(String(p.storeId)));
    const stores = await Store.find({ _id: { $in: [...new Set(ordered.map((p) => String(p.storeId)))] } }).select('name slug').lean();
    const smap = new Map(stores.map((st) => [String(st._id), st]));
    return ordered.map((p) => ({ ...p, store: smap.get(String(p.storeId)) ?? null }));
  }
  return catalogService.listProducts({ sort: s.sort || 'popularity', category: s.category || undefined, limit: s.limit || 8 });
}

async function resolveVendors(s: SectionLike): Promise<unknown[]> {
  const all = await catalogService.listStores();
  if (s.source === 'curated' && s.storeIds?.length) {
    const byId = new Map(all.map((st) => [String(st._id), st]));
    return s.storeIds.map((id) => byId.get(String(id))).filter(Boolean);
  }
  return all.slice(0, s.limit || 8);
}

/** Shown when the admin hasn't configured any sections yet (so the home is never blank). */
const DEFAULT_SECTIONS: SectionLike[] = [
  { title: '⭐ Top rated', type: 'products', source: 'auto', sort: 'rating', limit: 10 },
  { title: '🆕 New arrivals', type: 'products', source: 'auto', sort: 'newest', limit: 10 },
  { title: '🏬 Featured stores', subtitle: 'Shop from our top vendors', type: 'vendors', source: 'auto', limit: 8 },
];

export const homeService = {
  listAll() {
    return HomeSection.find().sort({ order: 1, createdAt: 1 }).lean();
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
  /** Public: enabled sections in order, each with its resolved items. Falls back to defaults. */
  async getHome() {
    const configured = (await HomeSection.find({ enabled: true }).sort({ order: 1 }).lean()) as unknown as SectionLike[];
    const sections = configured.length ? configured : DEFAULT_SECTIONS;
    const out = [];
    for (const s of sections) {
      const items = s.type === 'vendors' ? await resolveVendors(s) : await resolveProducts(s);
      out.push({
        _id: s._id ? String(s._id) : s.title,
        title: s.title, subtitle: s.subtitle ?? '', type: s.type,
        sort: s.sort ?? '', category: s.category ?? '', items,
      });
    }
    return out;
  },
};

const SectionSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  type: z.enum(['products', 'vendors']),
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
homeRoutes.patch('/reorder', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => ok(res, await homeService.reorder(z.object({ ids: z.array(z.string()) }).parse(req.body).ids))));
homeRoutes.patch('/:id', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => ok(res, await homeService.update(req.params.id!, SectionSchema.partial().parse(req.body)))));
homeRoutes.delete('/:id', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => ok(res, await homeService.remove(req.params.id!))));
