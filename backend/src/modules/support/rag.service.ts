import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { aiProvider } from '../../providers/ai/index.js';
import { Category } from '../categories/category.model.js';
import { ProductEmbedding } from './kb.model.js';

/**
 * Product RAG index — kept in sync with the catalog so the support bot can answer product
 * questions ("Flipkart-jaisa"). indexProduct runs fire-and-forget on product write; embeddings
 * are computed by the AiProvider (real OpenAI vectors, or the deterministic stub with no key).
 */

interface ProductLike {
  _id: unknown;
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  brand?: string | null;
  status?: string | null;
  storeId?: unknown;
  categoryId?: unknown;
  attributes?: Record<string, unknown> | null;
}

/** Build the text we embed: title + brand + category + description + attribute values. */
function embedText(p: ProductLike, categoryName?: string): string {
  const attrs = p.attributes
    ? Object.entries(p.attributes)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join('; ')
    : '';
  return [p.title, p.brand, categoryName, p.description, attrs].filter(Boolean).join('. ').slice(0, 4000);
}

/** (Re)embed one product and upsert its vector row. Never throws — safe to fire-and-forget. */
export async function indexProduct(p: ProductLike): Promise<void> {
  try {
    const category = p.categoryId ? await Category.findById(p.categoryId).select('name').lean() : null;
    const text = embedText(p, category?.name);
    const [embedding] = await aiProvider.embed([text]);
    await ProductEmbedding.findOneAndUpdate(
      { productId: p._id },
      {
        $set: {
          storeId: p.storeId,
          categoryId: p.categoryId,
          title: p.title,
          slug: p.slug,
          text,
          embedding: embedding ?? [],
          status: p.status ?? 'draft',
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logger.warn({ err: String(err), productId: String(p._id) }, '[rag] indexProduct failed');
  }
}

/** Drop a product's vector row (on delete). */
export async function removeProductIndex(productId: string): Promise<void> {
  await ProductEmbedding.deleteOne({ productId }).catch(() => {
    /* ignore */
  });
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den ? dot / den : 0;
}

export interface ProductHit {
  productId: string;
  title: string;
  slug: string;
  score: number;
}

/**
 * Semantic product search. Mongo (default): cosine in Node over active rows — works on any
 * MongoDB. Atlas: `$vectorSearch` over the embedding index (mirrors modules/search's engine switch).
 */
export async function searchProducts(
  query: string,
  opts: { storeId?: string; limit?: number } = {},
): Promise<ProductHit[]> {
  const limit = Math.min(opts.limit ?? 5, 20);
  const [q] = await aiProvider.embed([query]);
  if (!q?.length) return [];

  if (env.VECTOR_ENGINE === 'atlas') {
    try {
      const filter: Record<string, unknown> = { status: 'active' };
      if (opts.storeId) filter.storeId = opts.storeId;
      const rows = await ProductEmbedding.aggregate<{ title: string; slug: string; score: number }>([
        {
          $vectorSearch: {
            index: 'product_vectors',
            path: 'embedding',
            queryVector: q,
            numCandidates: 200,
            limit,
            filter,
          },
        },
        { $project: { title: 1, slug: 1, score: { $meta: 'vectorSearchScore' } } },
      ]);
      return rows.map((r) => ({ productId: '', title: r.title, slug: r.slug, score: r.score }));
    } catch (err) {
      logger.warn({ err: String(err) }, '[rag] atlas vectorSearch failed — falling back to mongo cosine');
    }
  }

  // Mongo cosine (dev default / fallback).
  const filter: Record<string, unknown> = { status: 'active', embedding: { $ne: [] } };
  if (opts.storeId) filter.storeId = opts.storeId;
  const docs = await ProductEmbedding.find(filter).select('productId title slug embedding').limit(1000).lean();
  return docs
    .map((d) => ({
      productId: String(d.productId),
      title: d.title ?? '',
      slug: d.slug ?? '',
      score: cosine(q, (d.embedding as number[]) ?? []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
