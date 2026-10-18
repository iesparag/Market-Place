import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Admin/vendor-authored policy/FAQ/how-to content (docs/10-SUPPORT-AI.md §4) — the
 * "KB" the bot grounds answers in. `storeId` null = platform-wide (returns policy,
 * shipping, etc.); set = that vendor's own doc, visible only to them + bots answering
 * about their store (rule 7: vendor data is store-scoped).
 *
 * Deliberately just CRUD here — chunking + embedding (KbChunk, cosine/vectorSearch
 * retrieval) is the RAG-ingestion phase (S2b in the doc) and a separate, larger piece
 * of work; this gives admins/vendors a place to actually write the content first.
 */
const kbDocSchema = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    category: { type: String, enum: ['policy', 'faq', 'howto', 'other'], default: 'faq', index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', index: true }, // undefined = platform-wide
    tags: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type KbDocDoc = InferSchemaType<typeof kbDocSchema>;
export const KbDoc = model('KbDoc', kbDocSchema);
