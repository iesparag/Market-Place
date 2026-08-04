import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Vector index for the support bot's product knowledge (docs/10-SUPPORT-AI.md §4).
 * One row per product, kept in sync on every product create/update/publish/delete via
 * rag.service.indexProduct. `embedding` is queried by cosine (VECTOR_ENGINE=mongo, dev) or
 * Atlas `$vectorSearch` (prod). Only `status:'active'` rows are surfaced to customers.
 */
const productEmbeddingSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    title: String,
    slug: String,
    text: String, // the exact content that was embedded (for debugging/re-index)
    embedding: { type: [Number], default: [] },
    status: { type: String, default: 'draft', index: true },
  },
  { timestamps: true },
);

export type ProductEmbeddingDoc = InferSchemaType<typeof productEmbeddingSchema>;
export const ProductEmbedding = model('ProductEmbedding', productEmbeddingSchema);
