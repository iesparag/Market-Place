import { Router } from 'express';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { env } from '../../config/env.js';
import { Product } from '../products/product.model.js';
import { Store } from '../stores/store.model.js';
import { Category } from '../categories/category.model.js';

/**
 * Swappable search layer (same pattern as payment/email/push providers).
 *   - 'mongo'  : works on ANY MongoDB, no setup, free forever, zero lock-in (default).
 *   - 'atlas'  : MongoDB Atlas Search ($search) — better fuzzy/relevance; needs search indexes.
 * The rest of the app + the frontend only know this interface, so the engine can change anytime.
 */
export interface SuggestProduct { _id: string; title: string; slug: string; code?: string; image?: string; minPrice: number; storeName?: string }
export interface SuggestStore { _id: string; name: string; slug: string; logo?: string }
export interface SuggestCategory { _id: string; name: string; slug: string }
export interface SuggestResult { products: SuggestProduct[]; stores: SuggestStore[]; categories: SuggestCategory[] }
export interface SearchProvider { suggest(q: string): Promise<SuggestResult> }

async function approvedStoreIds() {
  const s = await Store.find({ status: 'approved' }).select('_id').lean();
  return s.map((x) => x._id);
}
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Category typeahead — shared by both engines (few rows, regex is plenty). */
async function categoryMatches(term: string): Promise<SuggestCategory[]> {
  const rx = new RegExp(escapeRx(term), 'i');
  const cats = await Category.find({ name: rx }).select('name slug').limit(6).lean();
  return cats.map((c) => ({ _id: String(c._id), name: c.name, slug: c.slug }));
}

type ProdLite = { _id: unknown; title: string; slug: string; code?: string; images?: string[]; minPrice?: number; storeId: unknown };
async function attachStoreNames(products: ProdLite[]): Promise<SuggestProduct[]> {
  const storeIds = [...new Set(products.map((p) => String(p.storeId)))];
  const storeDocs = await Store.find({ _id: { $in: storeIds } }).select('name').lean();
  const smap = new Map(storeDocs.map((s) => [String(s._id), s.name]));
  return products.map((p) => ({
    _id: String(p._id), title: p.title, slug: p.slug, code: p.code,
    image: p.images?.[0], minPrice: p.minPrice ?? 0, storeName: smap.get(String(p.storeId)),
  }));
}

/** Default: regex + code match on plain MongoDB. Instant, universal, no external service. */
const mongoSearch: SearchProvider = {
  async suggest(q) {
    const term = q.trim();
    if (!term) return { products: [], stores: [], categories: [] };
    const rx = new RegExp(escapeRx(term), 'i');
    const approved = await approvedStoreIds();
    const [products, stores] = await Promise.all([
      Product.find({
        status: 'active', visibility: 'public', storeId: { $in: approved },
        $or: [{ title: rx }, { brand: rx }, { code: rx }],
      }).select('title slug code images minPrice storeId').sort({ salesCount: -1, ratingAvg: -1 }).limit(6).lean(),
      Store.find({ status: 'approved', name: rx }).select('name slug logo').limit(4).lean(),
    ]);
    return {
      products: await attachStoreNames(products as unknown as ProdLite[]),
      stores: (stores as { _id: unknown; name: string; slug: string; logo?: string }[]).map((s) => ({ _id: String(s._id), name: s.name, slug: s.slug, logo: s.logo })),
      categories: await categoryMatches(term),
    };
  },
};

/** Atlas Search — fuzzy autocomplete. Needs indexes: "default" (products.title/brand) + "stores" (stores.name). */
const atlasSearch: SearchProvider = {
  async suggest(q) {
    const term = q.trim();
    if (!term) return { products: [], stores: [], categories: [] };
    const approved = await approvedStoreIds();
    const products = await Product.aggregate<ProdLite>([
      { $search: { index: 'default', compound: { should: [
        { autocomplete: { query: term, path: 'title', fuzzy: { maxEdits: 1 } } },
        { autocomplete: { query: term, path: 'brand' } },
      ], minimumShouldMatch: 1 } } },
      { $match: { status: 'active', visibility: 'public', storeId: { $in: approved } } },
      { $limit: 6 },
      { $project: { title: 1, slug: 1, code: 1, images: 1, minPrice: 1, storeId: 1 } },
    ]);
    const stores = await Store.aggregate<{ _id: unknown; name: string; slug: string; logo?: string }>([
      { $search: { index: 'stores', autocomplete: { query: term, path: 'name', fuzzy: { maxEdits: 1 } } } },
      { $match: { status: 'approved' } },
      { $limit: 4 },
      { $project: { name: 1, slug: 1, logo: 1 } },
    ]);
    return {
      products: await attachStoreNames(products),
      stores: stores.map((s) => ({ _id: String(s._id), name: s.name, slug: s.slug, logo: s.logo })),
      categories: await categoryMatches(term),
    };
  },
};

export const searchProvider: SearchProvider = env.SEARCH_ENGINE === 'atlas' ? atlasSearch : mongoSearch;

export const searchRoutes = Router();
// Public typeahead: GET /search/suggest?q=ela → { products, stores }
searchRoutes.get('/suggest', asyncHandler(async (req, res) => ok(res, await searchProvider.suggest(String(req.query.q ?? '')))));
