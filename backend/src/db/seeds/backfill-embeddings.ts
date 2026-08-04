/**
 * One-off: build the support RAG index for every existing product. Going forward, embeddings
 * are kept in sync automatically on product create/update/publish/delete — but products created
 * before this feature (or bulk-seeded) need this one pass.
 *
 *   MONGO_URI="mongodb+srv://…/marketplace" OPENAI_API_KEY="sk-…" npm run backfill:embeddings
 *
 * With no OPENAI_API_KEY it still runs (deterministic stub vectors) so the pipeline is testable.
 */
import { connectDb, disconnectDb } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { Product } from '../../modules/products/product.model.js';
import { indexProduct } from '../../modules/support/rag.service.js';

async function run(): Promise<void> {
  await connectDb();
  const products = await Product.find({}).lean();
  logger.info(`Indexing ${products.length} products…`);
  let done = 0;
  for (const p of products) {
    await indexProduct(p as never);
    if (++done % 50 === 0) logger.info(`  …${done}/${products.length}`);
  }
  logger.info(`Backfill complete: ${done} products indexed.`);
  await disconnectDb();
}

run().catch((err) => {
  logger.error({ err }, 'backfill:embeddings failed');
  process.exit(1);
});
