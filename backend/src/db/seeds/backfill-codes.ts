/**
 * One-off: assign a unique product code (MP-000001…) to every product that lacks one.
 * Seeded products were bulk-inserted (bypassing the save hook), so they need this.
 *
 *   MONGO_URI="mongodb+srv://…/marketplace" npm run backfill:codes
 */
import { connectDb, disconnectDb } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { Product } from '../../modules/products/product.model.js';
import { Counter, formatProductCode } from '../../modules/products/counter.model.js';

async function run(): Promise<void> {
  await connectDb();
  const missing = await Product.find({ $or: [{ code: { $exists: false } }, { code: null }] })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean();
  logger.info(`Products without a code: ${missing.length}`);
  if (!missing.length) { await disconnectDb(); return; }

  // Continue numbering after any codes that already exist.
  const counter = await Counter.findById('product').lean();
  let seq = counter?.seq ?? 0;

  const ops = missing.map((p) => {
    seq += 1;
    return { updateOne: { filter: { _id: p._id }, update: { $set: { code: formatProductCode(seq) } } } };
  });
  await Product.bulkWrite(ops, { ordered: false });
  await Counter.findByIdAndUpdate('product', { $set: { seq } }, { upsert: true });

  logger.info(`✅ Assigned codes up to ${formatProductCode(seq)} (${missing.length} products)`);
  await disconnectDb();
}
void run();
