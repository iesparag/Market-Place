import { AppError } from '../../common/AppError.js';
import { Product } from '../products/product.model.js';
import { Category } from '../categories/category.model.js';
import { Store } from '../stores/store.model.js';

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
    query: { q?: string; category?: string; priceMin?: number; priceMax?: number; ratingMin?: number; veg?: boolean; sort?: string; page?: number; limit?: number } = {},
  ) {
    const limit = Math.min(query.limit ?? 12, 60);
    const page = Math.max(query.page ?? 1, 1);
    const filter: Record<string, unknown> = {
      status: 'active',
      visibility: 'public',
      storeId: { $in: await approvedStoreIds() }, // hide suspended-vendor products
    };
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
      .select('title slug images variants ratingAvg')
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

  /** All approved vendors (for the customer "Stores" page), with live product counts. */
  async listStores() {
    const stores = await Store.find({ status: 'approved' })
      .select('name slug description vendorType logo banner ratingAvg ratingCount')
      .sort({ createdAt: -1 })
      .lean();
    const counts = await Product.aggregate<{ _id: string; n: number }>([
      {
        $match: {
          status: 'active',
          visibility: 'public',
          storeId: { $in: stores.map((s) => s._id) },
        },
      },
      { $group: { _id: '$storeId', n: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
    return stores.map((s) => ({ ...s, productCount: countMap.get(String(s._id)) ?? 0 }));
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
    return { store, products, categoryTree };
  },
};
