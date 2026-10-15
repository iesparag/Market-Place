/**
 * One-off: resolve Store.location (GeoJSON point, used by $geoNear nearby-vendor search)
 * for every approved store that doesn't have one yet — i.e. every store registered before
 * the Places-backed address flow shipped. Uses the free Nominatim/LocationIQ geocoding
 * service (bulk/one-shot, doesn't need Places-grade precision), NOT Google Places —
 * no reason to spend Places quota backfilling old text addresses.
 *
 * Run (against Atlas):
 *   MONGO_URI="mongodb+srv://…/marketplace" npm run backfill:store-geo
 *   # preview without writing:
 *   MONGO_URI="…" npm run backfill:store-geo -- --dry-run
 *
 * Idempotent: stores that already have `location` are skipped, so re-running is safe.
 * IMPORTANT: run this before/alongside deploying lat/lng-filtered nearby search — until
 * it has run, every pre-existing approved store is invisible to $geoNear (it correctly
 * excludes docs with no `location`), so a customer in an already-serviced city could see
 * a false "not available in your city" empty state.
 */
import { connectDb, disconnectDb } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { Store } from '../../modules/stores/store.model.js';
import { geocodingService } from '../../modules/geocoding/geocoding.service.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function run(): Promise<void> {
  await connectDb();
  const missing = await Store.find({
    status: 'approved',
    $or: [{ location: { $exists: false } }, { 'location.coordinates': { $exists: false } }],
  })
    .select('_id name address')
    .lean();

  logger.info(`Approved stores without resolved location: ${missing.length}${DRY_RUN ? ' (dry run)' : ''}`);
  if (!missing.length) { await disconnectDb(); return; }

  let resolved = 0;
  let skipped = 0;
  for (const store of missing) {
    const addr = store.address as { line1?: string; city?: string; state?: string; pincode?: string } | undefined;
    const query = [addr?.line1, addr?.city, addr?.state, addr?.pincode].filter(Boolean).join(', ');
    if (!query) {
      logger.warn(`Skipping "${store.name}" (${store._id}) — no address text to geocode`);
      skipped += 1;
      continue;
    }

    const [hit] = await geocodingService.search(query);
    if (!hit) {
      logger.warn(`No geocode match for "${store.name}" (${store._id}): "${query}"`);
      skipped += 1;
      continue;
    }

    logger.info(`"${store.name}" → [${hit.lat}, ${hit.lng}] (${hit.label})`);
    if (!DRY_RUN) {
      await Store.updateOne(
        { _id: store._id },
        { $set: { location: { type: 'Point', coordinates: [hit.lng, hit.lat] } } },
      );
    }
    resolved += 1;
  }

  logger.info(`${DRY_RUN ? 'Would resolve' : 'Resolved'} ${resolved}, skipped ${skipped} (no match / no address).`);
  await disconnectDb();
}
void run();
