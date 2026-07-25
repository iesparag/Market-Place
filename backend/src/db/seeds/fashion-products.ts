/**
 * Bulk-seed 20 Shirts + 20 T-Shirts + 20 Jeans into a store.
 *
 * Run (against Atlas):
 *   MONGO_URI="mongodb+srv://…/marketplace" npm run seed:fashion
 *   # optional: pick the store by slug (else first fashion store, else first store)
 *   STORE="kapda-junction" MONGO_URI="…" npm run seed:fashion
 *
 * Idempotent: products whose slug already exists are skipped, so re-running is safe.
 * Categories/variant-axes are read live from the DB — it adapts to whatever you defined in the UI.
 */
import { connectDb, disconnectDb } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { Category } from '../../modules/categories/category.model.js';
import { Store } from '../../modules/stores/store.model.js';
import { Product } from '../../modules/products/product.model.js';

// ── tiny helpers ────────────────────────────────────────────────────────────
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]) => arr[rand(0, arr.length - 1)]!;
const priceEnding99 = (min: number, max: number) => Math.floor(rand(min, max) / 100) * 100 + 99; // ₹ ending in 99
const cartesian = (lists: string[][]): string[][] =>
  lists.reduce<string[][]>((acc, list) => acc.flatMap((c) => list.map((v) => [...c, v])), [[]]);

// ── data pools ──────────────────────────────────────────────────────────────
const BRANDS = ['Allen Solly', 'Peter England', 'Van Heusen', 'Louis Philippe', 'Arrow', 'US Polo', 'Levis', 'Wrangler', 'H&M', 'Puma'];
const COLORS = ['Black', 'White', 'Blue', 'Grey', 'Navy', 'Olive', 'Maroon'];

/** Value pool for a variant axis (branch on jeans for waist sizes). */
function axisPool(axis: string, catSlug: string): string[] {
  if (axis === 'size') return catSlug.includes('jean') ? ['30', '32', '34', '36'] : ['S', 'M', 'L', 'XL'];
  if (axis === 'color') return COLORS;
  if (axis === 'weight') return ['500g', '1kg'];
  if (axis === 'volume') return ['1L', '5L'];
  return ['Standard'];
}

/** Build variants for a product from the category's real variantAxes. */
function buildVariants(axes: string[], catSlug: string, baseSlug: string, priceRange: [number, number]) {
  const price = priceEnding99(priceRange[0], priceRange[1]) * 100; // → paise
  const chosen = axes.length
    ? axes.map((ax) => {
        const pool = axisPool(ax, catSlug);
        // 3 sizes, 2 colors — a realistic subset, shuffled a little.
        const n = ax === 'color' ? 2 : Math.min(3, pool.length);
        return [...pool].sort(() => Math.random() - 0.5).slice(0, n);
      })
    : [['Standard']];
  const combos = cartesian(chosen);
  return combos.map((c, i) => ({
    sku: `${baseSlug}-${c.join('-')}`.toLowerCase().replace(/\s+/g, ''),
    optionValues: axes.length ? Object.fromEntries(axes.map((ax, j) => [ax, c[j]])) : { variant: `v${i + 1}` },
    price,
    currency: 'INR',
    stock: rand(5, 40),
  }));
}

/** Stable per-product lock so loremflickr returns the SAME images on every load. */
function lockNum(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h;
}
/** Category + colour specific images via loremflickr (keyword-matched, e.g. "jeans,blue"). */
const imgs = (keyword: string, color: string, seed: string) => {
  const kw = color ? `${keyword},${color.toLowerCase()}` : keyword;
  const base = lockNum(seed);
  return [0, 1, 2].map((n) => `https://loremflickr.com/600/700/${kw}?lock=${base + n}`);
};

// ── per-category product generators ─────────────────────────────────────────
type Gen = (i: number) => { title: string; description: string; attributes: Record<string, unknown> };

const OCCASIONS = ['office wear', 'casual outings', 'everyday comfort', 'weekend style', 'party nights', 'daily use', 'college days'];
/** Vary the description across a few templates so no two read the same. */
function describe(brand: string, adjectives: string, noun: string, extra: string): string {
  return pick([
    `Elevate your wardrobe with this ${adjectives} ${noun} from ${brand} — ${extra}.`,
    `${brand} brings you a ${adjectives} ${noun}, perfect for ${pick(OCCASIONS)}. ${extra}.`,
    `Premium ${adjectives} ${noun} by ${brand}. ${extra} — built to last.`,
    `Stay sharp in this ${adjectives} ${noun}. ${extra}, ideal for ${pick(OCCASIONS)}.`,
    `A must-have ${adjectives} ${noun} from ${brand} — ${extra}.`,
  ]);
}

const shirtGen: Gen = (i) => {
  const brand = BRANDS[i % BRANDS.length]!;
  // Enum values below MUST match the "Shirts" category attributeSchema options.
  const fabric = pick(['Cotton', 'Linen', 'Polyester']);
  const fit = pick(['Slim', 'Regular', 'Loose']);
  const sleeve = pick(['Full', 'Half']);
  const pattern = pick(['Solid', 'Checked', 'Printed']);
  const color = pick(COLORS);
  return {
    title: `${brand} ${color} ${pattern} ${fabric} Shirt`,
    description: describe(brand, `${fit.toLowerCase()}-fit ${pattern.toLowerCase()}`, 'shirt', `${sleeve.toLowerCase()}-sleeve ${fabric.toLowerCase()} fabric in ${color.toLowerCase()}`),
    attributes: { brand, fabric, fit, sleeve, pattern },
  };
};

const teeGen: Gen = (i) => {
  const brand = BRANDS[i % BRANDS.length]!;
  // Enum values below MUST match the "T-Shirts" category attributeSchema options.
  const fabric = pick(['Cotton', 'Polyester']);
  const neck = pick(['Round', 'V-Neck', 'Collar']);
  const sleeve = pick(['Half', 'Full']);
  const look = pick(['Solid', 'Graphic', 'Striped', 'Printed']); // title-only flourish (no "pattern" attribute on tees)
  const color = pick(COLORS);
  return {
    title: `${brand} ${color} ${look} ${neck} T-Shirt`,
    description: describe(brand, `${neck.toLowerCase()}-neck ${look.toLowerCase()}`, 't-shirt', `soft ${fabric.toLowerCase()}, ${sleeve.toLowerCase()}-sleeve in ${color.toLowerCase()}`),
    attributes: { brand, fabric, neck, sleeve },
  };
};

const jeansGen: Gen = () => {
  const brand = pick(['Levis', 'Wrangler', 'Pepe', 'Spykar', 'Killer', 'US Polo', 'Lee', 'Flying Machine']);
  // Enum values below MUST match the "Jeans" category attributeSchema options.
  const fit = pick(['Slim', 'Regular', 'Bootcut']);
  const wash = pick(['Light', 'Dark', 'Black']);
  const color = wash === 'Black' ? 'Black' : pick(['Blue', 'Indigo', 'Grey', 'Navy']);
  const stretch = Math.random() > 0.5;
  return {
    title: `${brand} ${color} ${wash} Wash ${fit} Jeans`,
    description: describe(brand, `${fit.toLowerCase()}-fit ${wash.toLowerCase()}-wash`, 'jeans', `${stretch ? 'stretchable' : 'classic rigid'} denim in ${color.toLowerCase()}`),
    attributes: { brand, fit, wash, stretch },
  };
};

// ── main ────────────────────────────────────────────────────────────────────
async function findCategory(nameRegex: RegExp, slugs: string[]) {
  return (
    (await Category.findOne({ slug: { $in: slugs } })) ??
    (await Category.findOne({ name: nameRegex }))
  );
}

async function seedInto(catName: string, nameRegex: RegExp, slugs: string[], gen: Gen, priceRange: [number, number], storeId: unknown, count: number, keyword: string) {
  const cat = await findCategory(nameRegex, slugs);
  if (!cat) { logger.warn(`⚠️  Category "${catName}" not found — skipping (create it in the UI first)`); return 0; }
  const axes = (cat.variantAxes ?? []) as string[];
  // RESET=1 → wipe this category's products (for this store) first, so we don't accumulate dupes.
  if (process.env.RESET) {
    const del = await Product.deleteMany({ categoryId: cat._id, storeId });
    logger.info(`🧹 ${catName}: cleared ${del.deletedCount} existing products (RESET)`);
  }
  let made = 0;
  let refreshed = 0;
  for (let i = 0; i < count; i++) {
    const g = gen(i);
    const baseSlug = `${cat.slug}-${i + 1}`; // deterministic → re-runs refresh instead of duplicating
    const existing = await Product.findOne({ slug: baseSlug });
    if (existing) {
      // Already there → refresh just the images to the category+colour version.
      const ov = existing.variants?.[0]?.optionValues as Map<string, string> | undefined;
      existing.images = imgs(keyword, ov?.get('color') ?? '', baseSlug);
      await existing.save();
      refreshed++;
      continue;
    }
    const variants = buildVariants(axes, cat.slug, baseSlug, priceRange);
    const color = (variants[0]?.optionValues as Record<string, string> | undefined)?.['color'] ?? '';
    await Product.create({
      storeId,
      categoryId: cat._id,
      title: g.title,
      slug: baseSlug,
      description: g.description,
      brand: g.attributes['brand'],
      images: imgs(keyword, color, baseSlug),
      attributes: g.attributes,
      variants,
      modifierGroups: [],
      status: 'active',
      visibility: 'public',
    });
    made++;
  }
  logger.info(`✅ ${catName}: ${made} new + ${refreshed} image-refreshed (axes: ${axes.join(', ') || 'none'})`);
  return made;
}

async function run(): Promise<void> {
  await connectDb();

  const storeSlug = process.env.STORE;
  const store =
    (storeSlug ? await Store.findOne({ slug: storeSlug }) : null) ??
    (await Store.findOne({ vendorType: 'fashion' })) ??
    (await Store.findOne());
  if (!store) throw new Error('No store found — create a store first (register a vendor).');

  // COUNT = products PER category (default 20). e.g. COUNT=200 → 200 each = 600 total.
  const count = Number(process.env.COUNT) || 20;
  logger.info(`Seeding ${count} products per category into store: ${store.name} (${store.slug})`);

  await seedInto('Shirts', /^shirts$/i, ['shirts'], shirtGen, [699, 1499], store._id, count, 'shirt');
  await seedInto('T-Shirts', /^t-?shirts$/i, ['t-shirts', 'tshirts', 'mens-tshirts'], teeGen, [399, 899], store._id, count, 'tshirt');
  await seedInto('Jeans', /^jeans$/i, ['jeans', 'mens-jeans'], jeansGen, [1299, 2499], store._id, count, 'jeans');

  logger.info('Fashion seed complete 🎉');
  await disconnectDb();
}

void run();
