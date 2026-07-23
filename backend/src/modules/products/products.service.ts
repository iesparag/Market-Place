import type { AttributeDef, Product as ProductInput } from '@app/shared';
import { AppError } from '../../common/AppError.js';
import { Category } from '../categories/category.model.js';
import { Store } from '../stores/store.model.js';
import { Product } from './product.model.js';
import { buildAttributeValidator } from './attributeValidator.js';

/** Vendor is scoped to their own store; admin (no storeId) may manage any product. */
function scopeFilter(storeId: string | undefined, id: string): { _id: string; storeId?: string } {
  return storeId ? { _id: id, storeId } : { _id: id };
}

/** Validate incoming attributes against the product's category attributeSchema. */
async function validateAttributes(categoryId: string, attributes: Record<string, unknown>) {
  const category = await Category.findById(categoryId).lean();
  if (!category) throw AppError.notFound('Category not found');
  const defs = (category.attributeSchema ?? []) as unknown as AttributeDef[];
  const validator = buildAttributeValidator(defs);
  const result = validator.safeParse(attributes);
  if (!result.success) {
    throw AppError.badRequest(
      'PRODUCT_ATTR_INVALID',
      'Product attributes do not match category schema',
      result.error.flatten(),
    );
  }
  return result.data;
}

export const productsService = {
  /** List a store's products (vendor) or all (admin) — with the owning vendor's name. */
  async list(storeId: string | undefined) {
    const filter = storeId ? { storeId } : {};
    const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
    const storeIds = [...new Set(products.map((p) => String(p.storeId)))];
    const stores = await Store.find({ _id: { $in: storeIds } }).select('name slug status').lean();
    const map = new Map(stores.map((s) => [String(s._id), s]));
    return products.map((p) => ({ ...p, store: map.get(String(p.storeId)) ?? null }));
  },

  async create(storeId: string, input: ProductInput) {
    if (!storeId) throw AppError.forbidden('No store in scope');
    const attributes = await validateAttributes(input.categoryId, input.attributes ?? {});
    return Product.create({ ...input, attributes, storeId });
  },

  async update(storeId: string | undefined, id: string, input: Partial<ProductInput>) {
    const product = await Product.findOne(scopeFilter(storeId, id));
    if (!product) throw AppError.notFound('Product not found');
    if (input.attributes && input.categoryId) {
      input.attributes = await validateAttributes(input.categoryId, input.attributes);
    }
    product.set(input);
    await product.save();
    return product;
  },

  async getOne(storeId: string | undefined, id: string) {
    const product = await Product.findOne(scopeFilter(storeId, id)).lean();
    if (!product) throw AppError.notFound('Product not found');
    return product;
  },

  /** Set a variant's stock (inventory management). */
  async adjustStock(storeId: string | undefined, id: string, variantSku: string, stock: number) {
    const product = await Product.findOne(scopeFilter(storeId, id));
    if (!product) throw AppError.notFound('Product not found');
    const variant = product.variants.find((v) => v.sku === variantSku);
    if (!variant) throw AppError.badRequest('VARIANT_NOT_FOUND', 'Variant not found');
    variant.stock = Math.max(0, stock);
    await product.save();
    return product;
  },

  /** Vendor low-stock report (stock <= threshold). */
  async lowStock(storeId: string, threshold = 5) {
    const products = await Product.find({ storeId }).lean();
    const rows: { productId: string; title: string; sku: string; stock: number }[] = [];
    for (const p of products) {
      for (const v of p.variants) {
        if (v.trackInventory !== false && v.stock <= threshold) {
          rows.push({ productId: String(p._id), title: p.title, sku: v.sku, stock: v.stock });
        }
      }
    }
    return rows;
  },

  async remove(storeId: string | undefined, id: string) {
    const res = await Product.deleteOne(scopeFilter(storeId, id));
    if (res.deletedCount === 0) throw AppError.notFound('Product not found');
    return { deleted: true };
  },

  /** Turn a product on (active) or off (archived). Admin: any product; vendor: own only. */
  async setPublished(storeId: string | undefined, id: string, active: boolean) {
    const product = await Product.findOne(scopeFilter(storeId, id));
    if (!product) throw AppError.notFound('Product not found');
    product.status = active ? 'active' : 'archived';
    await product.save();
    return product;
  },
};
