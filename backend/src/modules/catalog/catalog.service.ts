import { AppError } from '../../common/AppError.js';
import { env } from '../../config/env.js';
import { Product } from '../products/product.model.js';
import { Category } from '../categories/category.model.js';
import { Store, isStoreOpenNow } from '../stores/store.model.js';
import { haversineKm } from '../../common/geo.js';

export interface GeoQuery {
  lat?: number;
  lng?: number;
}

/** IDs of stores customers may buy from. Suspended/pending/rejected vendors are excluded. */
async function approvedStoreIds() {
  const stores = await Store.find({ status: 'approved' }).select('_id').lean();
  return stores.map((s) => s._id);
}

interface CatLite { _id: string; name: string; slug: string; parentId: string | null }
export interface CatNode { _id: string; name: string; slug: string; children: CatNode[] }

/** Nest a flat category list into a tree (roots = categories with no/unknown parent). */
function buildTree(cats: CatLite[]): CatNode[] {
  const byId = new Map<string, CatNode>();
  for (const c of cats) byId.set(c._id, { _id: c._id, name: c.name, slug: c.slug, children: [] });
  const roots: CatNode[] = [];
  for (const c of cats) {
    const node = byId.get(c._id)!;
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Public storefront reads. Only active + public products from APPROVED stores. */
export const catalogService = {
  async listProducts(
    query: { q?: string; category?: string; priceMin?: number; priceMax?: number; ratingMin?: number; veg?: boolean; sort?: string; page?: number; limit?: number; ids?: string[] } = {},
  ) {
    const limit = Math.min(query.limit ?? 12, 60);
    const page = Math.max(query.page ?? 1, 1);
    const filter: Record<string, unknown> = {
      status: 'active',
      visibility: 'public',
      storeId: { $in: await approvedStoreIds() }, // hide suspended-vendor products
    };

    // Pinned-ids mode: a push-notification "product showcase" tap deep-links here with
    // the exact products that were attached in the admin composer, so they land "at the
    // top" — literally the only things shown, in the order they were attached, ignoring
    // every other filter/sort. See notifications.module.ts's notify() for where this
    // link gets built.
    if (query.ids?.length) {
      const docs = await Product.find({ _id: { $in: query.ids }, ...filter }).lean();
      const byId = new Map(docs.map((p) => [String(p._id), p]));
      const ordered = query.ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
      const storeIds = [...new Set(ordered.map((p) => String(p.storeId)))];
      const stores = await Store.find({ _id: { $in: storeIds } }).select('name slug').lean();
      const storeMap = new Map(stores.map((s) => [String(s._id), s]));
      return ordered.map((p) => ({ ...p, store: storeMap.get(String(p.storeId)) ?? null }));
    }

    // category may be a single slug OR a comma-separated list (multi-select) → match any.
    if (query.category) {
      const slugs = query.category.split(',').map((s) => s.trim()).filter(Boolean);
      const cats = await Category.find({ slug: { $in: slugs } }).select('_id').lean();
      if (cats.length) filter.categoryId = { $in: cats.map((c) => c._id) };
      else filter.categoryId = null; // no such category → empty result, not "all"
    }
    if (query.q) filter.$text = { $search: query.q };
    if (query.priceMin != null || query.priceMax != null) {
      const price: Record<string, number> = {};
      if (query.priceMin != null) price.$gte = query.priceMin;
      if (query.priceMax != null) price.$lte = query.priceMax;
      filter.minPrice = price;
    }
    if (query.ratingMin != null) filter.ratingAvg = { $gte: query.ratingMin };
    // Veg-only: first-class foodType OR legacy boolean "veg" attribute.
    if (query.veg) filter.$or = [{ foodType: 'veg' }, { 'attributes.veg': true }];
    const sort: Record<string, 1 | -1> =
      query.sort === 'popularity' ? { salesCount: -1, ratingCount: -1 }
      : query.sort === 'rating' ? { ratingAvg: -1, ratingCount: -1 }
      : query.sort === 'price_asc' ? { minPrice: 1 }
      : query.sort === 'price_desc' ? { minPrice: -1 }
      : { createdAt: -1 };
    const products = await Product.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort(sort)
      .lean();
    // attach store name
    const storeIds = [...new Set(products.map((p) => String(p.storeId)))];
    const stores = await Store.find({ _id: { $in: storeIds } })
      .select('name slug')
      .lean();
    const storeMap = new Map(stores.map((s) => [String(s._id), s]));
    return products.map((p) => ({ ...p, store: storeMap.get(String(p.storeId)) ?? null }));
  },

  /**
   * Resolves a productId → its current slug (+ current price, for the "has this changed
   * since I ordered it" comparison) — used by the order-detail screen, where an order's
   * item snapshot carries productId but never a slug (slugs can change; the snapshot is
   * deliberately frozen at order time). 404s the same way getProductBySlug does for a
   * product that's since been deactivated/removed — "no longer available" is accurate,
   * not a bug, for an old order pointing at a product that doesn't sell anymore.
   */
  async getProductSlugById(id: string) {
    const product = await Product.findOne({ _id: id, status: 'active', visibility: 'public' })
      .select('slug minPrice')
      .lean();
    if (!product) throw AppError.notFound('Product not found');
    return { slug: product.slug, currentPrice: product.minPrice };
  },

  async getProductBySlug(slug: string) {
    const product = await Product.findOne({ slug, status: 'active', visibility: 'public' }).lean();
    if (!product) throw AppError.notFound('Product not found');
    const store = await Store.findById(product.storeId).select('name slug ratingAvg status').lean();
    // Suspended / unapproved vendor → product not available to customers.
    if (!store || store.status !== 'approved') throw AppError.notFound('Product not available');
    const approved = await approvedStoreIds();
    const related = await Product.find({
      categoryId: product.categoryId,
      _id: { $ne: product._id },
      status: 'active',
      visibility: 'public',
      storeId: { $in: approved },
    })
      .select('title slug images variants ratingAvg ratingCount minPrice storeId code')
      .limit(6)
      .lean();
    // Category attribute definitions → so the storefront can render labeled specs (veg, cuisine…).
    const category = await Category.findById(product.categoryId).select('name attributeSchema').lean();
    return { ...product, store, related, categoryName: category?.name ?? '', attributeDefs: category?.attributeSchema ?? [] };
  },

  async listCategories() {
    return Category.find().select('name slug appliesTo').lean();
  },

  /** Global category hierarchy for the storefront mega-menu (departments → sub-categories). */
  async categoryTree(): Promise<CatNode[]> {
    const cats = await Category.find().select('name slug parentId').sort({ name: 1 }).lean();
    return buildTree(
      cats.map((c) => ({ _id: String(c._id), name: c.name, slug: c.slug, parentId: c.parentId ? String(c.parentId) : null })),
    );
  },

  /**
   * All approved vendors (for the customer "Stores" page / home feed), with live product
   * counts. When lat/lng are given, runs a $geoNear aggregation against Store.location
   * instead — sorted nearest-first, capped to env.SERVICEABLE_RADIUS_KM, and carrying a
   * real `distanceMeters` per store (used to compute a real ETA, not a mock). $geoNear
   * implicitly excludes stores with no resolved `location` (pre-migration / unregistered
   * via Places yet) rather than falsely placing them at [0,0].
   */
  async listStores(geo: GeoQuery = {}) {
    const allStores = await Store.find({ status: 'approved' })
      .select('name slug description vendorType logo banner ratingAvg ratingCount availabilityStatus operatingHours holidays location address')
      .sort({ createdAt: -1 })
      .lean();

    const counts = await Product.aggregate<{ _id: string; n: number }>([
      {
        $match: {
          status: 'active',
          visibility: 'public',
          storeId: { $in: allStores.map((s) => s._id) },
        },
      },
      { $group: { _id: '$storeId', n: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.n]));

    const enriched = allStores.map((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { availabilityStatus, operatingHours, holidays, ...rest } = s as Record<string, unknown>;

      let distanceMeters: number | undefined;
      const rawLocation = (s as any).location;
      const coords = rawLocation?.coordinates;
      if (geo.lat != null && geo.lng != null && coords && coords.length === 2) {
        const [lng, lat] = coords;
        if (lat != null && lng != null) {
          const distanceKm = haversineKm({ lat: geo.lat, lng: geo.lng }, { lat, lng });
          distanceMeters = Math.round(distanceKm * 1000);
        }
      }

      const isOpen = isStoreOpenNow(s as never);
      const isLocal = distanceMeters != null ? distanceMeters <= env.SERVICEABLE_RADIUS_KM * 1000 : false;
      const isNowEligible = isLocal && isOpen && distanceMeters != null && distanceMeters <= env.NOW_RADIUS_KM * 1000;
      const estimatedDelivery = isNowEligible
        ? '⚡ 15–30 mins'
        : isLocal
          ? '⚡ Delivery today'
          : '📦 Estimated 5–6 days';

      const [storeLng, storeLat] = coords ?? [];
      const storeAddr = (s as any).address;

      return {
        ...rest,
        location: rawLocation,
        lat: storeLat ?? (s as any).lat,
        lng: storeLng ?? (s as any).lng,
        city: storeAddr?.city ?? (s as any).city,
        pincode: storeAddr?.pincode ?? (s as any).pincode,
        address: storeAddr,
        distanceMeters,
        isLocal,
        isNowEligible,
        deliveryType: isLocal ? 'instant' : 'standard',
        estimatedDelivery,
        productCount: countMap.get(String(s._id)) ?? 0,
        isOpenNow: isOpen,
      };
    });

    if (geo.lat != null && geo.lng != null) {
      enriched.sort((a, b) => {
        if (a.distanceMeters != null && b.distanceMeters != null) return a.distanceMeters - b.distanceMeters;
        if (a.distanceMeters != null) return -1;
        if (b.distanceMeters != null) return 1;
        return 0;
      });
    }

    return enriched;
  },

  /**
   * "Now" feed — same $geoNear shape as listStores, but tighter radius
   * (env.NOW_RADIUS_KM, instant-delivery distance, not just "serviceable") AND filtered
   * to stores that are actually open at this exact moment (isStoreOpenNow). This is the
   * query backing the customer app's "Now" tab.
   */
  async listNowStores(geo: GeoQuery = {}) {
    if (geo.lat == null || geo.lng == null) return [];
    const stores = await Store.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [geo.lng, geo.lat] },
          distanceField: 'distanceMeters',
          spherical: true,
          maxDistance: env.NOW_RADIUS_KM * 1000,
          query: { status: 'approved' },
        },
      },
      {
        $project: {
          name: 1, slug: 1, description: 1, vendorType: 1, logo: 1, banner: 1,
          ratingAvg: 1, ratingCount: 1, distanceMeters: 1,
          availabilityStatus: 1, operatingHours: 1, holidays: 1,
        },
      },
    ]);
    const open = stores.filter((s) => isStoreOpenNow(s as never));
    const counts = await Product.aggregate<{ _id: string; n: number }>([
      { $match: { status: 'active', visibility: 'public', storeId: { $in: open.map((s) => s._id) } } },
      { $group: { _id: '$storeId', n: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
    return open.map((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { availabilityStatus, operatingHours, holidays, ...rest } = s as Record<string, unknown>;
      return { ...rest, productCount: countMap.get(String(s._id)) ?? 0, isOpenNow: true };
    });
  },

  async getStoreBySlug(slug: string) {
    const store = await Store.findOne({ slug, status: 'approved' }).lean();
    if (!store) throw AppError.notFound('Store not found');
    const products = await Product.find({
      storeId: store._id,
      status: 'active',
      visibility: 'public',
    }).lean();

    // Store-scoped category tree: only the categories THIS store sells in, plus their
    // ancestors (so the menu stays connected to departments). Global cats are NOT shown here.
    const allCats = await Category.find().select('name slug parentId').lean();
    const catMap = new Map<string, CatLite>(
      allCats.map((c) => [String(c._id), { _id: String(c._id), name: c.name, slug: c.slug, parentId: c.parentId ? String(c.parentId) : null }]),
    );
    const include = new Set<string>();
    for (const p of products) {
      let cur: string | null = p.categoryId ? String(p.categoryId) : null;
      while (cur && catMap.has(cur) && !include.has(cur)) {
        include.add(cur);
        cur = catMap.get(cur)!.parentId;
      }
    }
    const categoryTree = buildTree([...include].map((id) => catMap.get(id)!));
    return { store: { ...store, isOpenNow: isStoreOpenNow(store) }, products, categoryTree };
  },
};
