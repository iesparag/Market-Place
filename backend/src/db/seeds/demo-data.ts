/**
 * Big demo dataset: 20 vendor stores across every vertical, each with 100+ realistic,
 * category-appropriate products (kirana → dal/haldi/masala, pharmacy → medicines, etc.)
 * with keyword+colour-matched images. Every vendor logs in with password "12345678".
 *
 * Run (against Atlas):  MONGO_URI="mongodb+srv://…/marketplace" npm run seed:demo
 * Idempotent: re-running clears each demo store's products and regenerates. Kapda Junction is untouched.
 */
import bcrypt from 'bcryptjs';
import { Role } from '@app/shared';
import { connectDb, disconnectDb } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { Category } from '../../modules/categories/category.model.js';
import { Store } from '../../modules/stores/store.model.js';
import { User } from '../../modules/auth/user.model.js';
import { Product } from '../../modules/products/product.model.js';

// ── helpers ─────────────────────────────────────────────────────────────────
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)]!;
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const priceEnding99 = (min: number, max: number) => Math.floor(rand(min, max) / 10) * 10 + 9;
const shuffle = <T>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
const cartesian = (lists: string[][]): string[][] => lists.reduce<string[][]>((acc, l) => acc.flatMap((c) => l.map((v) => [...c, v])), [[]]);
function lockNum(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000; return h; }
const imgs = (keyword: string, color: string, seed: string) => {
  const kw = color ? `${keyword},${color.toLowerCase()}` : keyword;
  const base = lockNum(seed);
  return [0, 1, 2].map((n) => `https://loremflickr.com/600/700/${encodeURIComponent(kw)}?lock=${base + n}`);
};

function axisPool(axis: string, catName: string): string[] {
  if (axis === 'size') return /jean/i.test(catName) ? ['30', '32', '34', '36'] : ['S', 'M', 'L', 'XL'];
  if (axis === 'color') return ['Black', 'White', 'Blue', 'Grey', 'Red', 'Green', 'Navy', 'Maroon'];
  if (axis === 'weight') return ['500g', '1kg', '2kg', '5kg'];
  if (axis === 'volume') return ['500ml', '1L', '2L', '5L'];
  if (axis === 'storage') return ['64GB', '128GB', '256GB'];
  return ['Standard'];
}
function buildVariants(axes: string[], catName: string, baseSlug: string, price: number) {
  const chosen = axes.length
    ? axes.map((ax) => shuffle(axisPool(ax, catName)).slice(0, ax === 'color' ? 2 : 3))
    : [['Standard']];
  return cartesian(chosen).map((c, i) => ({
    sku: `${baseSlug}-${c.join('-')}`.toLowerCase().replace(/\s+/g, ''),
    optionValues: axes.length ? Object.fromEntries(axes.map((ax, j) => [ax, c[j]!])) : { variant: `v${i + 1}` },
    price,
    currency: 'INR',
    stock: rand(5, 60),
  }));
}

interface AttrDef { key: string; label: string; type: string; required?: boolean; options?: string[] }
function genAttrs(schema: AttrDef[], brand: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of schema) {
    if (a.key === 'brand') { out['brand'] = brand || 'Generic'; continue; }
    if (a.type === 'enum' && a.options?.length) out[a.key] = pick(a.options);
    else if (a.type === 'boolean') out[a.key] = Math.random() > 0.5;
    else if (a.type === 'number') out[a.key] = rand(1, 60);
  }
  return out;
}

// ── leaf catalog (names slugify to existing slugs where they already exist) ──
interface Leaf {
  name: string; dept: string; group?: string; appliesTo: string;
  axes: string[]; attrs: AttrDef[]; keyword: string; names: string[]; brands: string[];
  price: [number, number]; food?: boolean;
}
const A = (key: string, label: string, type: string, options?: string[]): AttrDef => ({ key, label, type, required: false, options });

const LEAVES: Record<string, Leaf> = {
  // Kirana
  'dals-pulses': { name: 'Dals & Pulses', dept: 'Kirana (Grocery)', appliesTo: 'grocery', axes: ['weight'], attrs: [A('brand', 'Brand', 'string'), A('organic', 'Organic', 'boolean')], keyword: 'lentils', price: [80, 320], brands: ['Tata Sampann', 'Fortune', 'Organic Tattva', '24 Mantra', 'Farm Fresh'], names: ['Toor Dal', 'Moong Dal', 'Chana Dal', 'Masoor Dal', 'Urad Dal', 'Rajma', 'Kabuli Chana', 'Green Moong', 'Black Chana'] },
  'spices-masala': { name: 'Spices & Masala', dept: 'Kirana (Grocery)', appliesTo: 'grocery', axes: ['weight'], attrs: [A('brand', 'Brand', 'string'), A('form', 'Form', 'enum', ['Whole', 'Powder'])], keyword: 'indian-spices', price: [40, 420], brands: ['Everest', 'MDH', 'Catch', 'Tata Sampann', 'Aachi'], names: ['Turmeric Powder', 'Red Chilli Powder', 'Coriander Powder', 'Cumin Seeds', 'Garam Masala', 'Black Pepper', 'Mustard Seeds', 'Chaat Masala', 'Kitchen King Masala'] },
  'atta-flour': { name: 'Atta & Flour', dept: 'Kirana (Grocery)', appliesTo: 'grocery', axes: ['weight'], attrs: [A('brand', 'Brand', 'string')], keyword: 'flour', price: [45, 600], brands: ['Aashirvaad', 'Fortune', 'Pillsbury', 'Nature Fresh'], names: ['Whole Wheat Atta', 'Multigrain Atta', 'Besan', 'Maida', 'Rice Flour', 'Sooji Rava', 'Ragi Flour'] },
  'edible-oil': { name: 'Edible Oil', dept: 'Kirana (Grocery)', appliesTo: 'grocery', axes: ['volume'], attrs: [A('brand', 'Brand', 'string')], keyword: 'cooking-oil', price: [120, 1600], brands: ['Fortune', 'Saffola', 'Dhara', 'Gemini', 'Figaro'], names: ['Sunflower Oil', 'Mustard Oil', 'Groundnut Oil', 'Refined Oil', 'Olive Oil', 'Rice Bran Oil'] },
  'rice-grains': { name: 'Rice & Grains', dept: 'Kirana (Grocery)', appliesTo: 'grocery', axes: ['weight'], attrs: [A('brand', 'Brand', 'string')], keyword: 'rice', price: [60, 900], brands: ['India Gate', 'Daawat', 'Kohinoor', 'Fortune', 'Lal Qilla'], names: ['Basmati Rice', 'Sona Masoori Rice', 'Brown Rice', 'Poha', 'Daliya', 'Idli Rice'] },
  // Food
  'pizza': { name: 'Pizza', dept: 'Food', appliesTo: 'food', axes: ['size'], attrs: [], keyword: 'pizza', price: [149, 599], food: true, brands: [], names: ['Margherita Pizza', 'Farmhouse Pizza', 'Peppy Paneer Pizza', 'Veggie Supreme Pizza', 'Cheese Burst Pizza', 'Tandoori Paneer Pizza', 'Chicken Tikka Pizza'] },
  'burgers-wraps': { name: 'Burgers & Wraps', dept: 'Food', appliesTo: 'food', axes: [], attrs: [], keyword: 'burger', price: [59, 249], food: true, brands: [], names: ['Veg Burger', 'Aloo Tikki Burger', 'Paneer Burger', 'Cheese Burger', 'Chicken Burger', 'Veg Wrap', 'Paneer Wrap'] },
  'biryani': { name: 'Biryani', dept: 'Food', appliesTo: 'food', axes: [], attrs: [], keyword: 'biryani', price: [149, 399], food: true, brands: [], names: ['Veg Biryani', 'Paneer Biryani', 'Hyderabadi Dum Biryani', 'Chicken Biryani', 'Mushroom Biryani', 'Egg Biryani'] },
  // Pharmacy
  'medicines': { name: 'Medicines', dept: 'Pharmacy', appliesTo: 'generic', axes: [], attrs: [A('brand', 'Brand', 'string'), A('form', 'Form', 'enum', ['Tablet', 'Syrup', 'Capsule']), A('prescriptionRequired', 'Prescription', 'boolean')], keyword: 'medicine', price: [20, 350], brands: ['Cipla', 'Sun Pharma', 'Dr Reddy', 'Mankind', 'Zydus'], names: ['Paracetamol 500mg', 'Cetirizine 10mg', 'Azithromycin 500mg', 'Amoxicillin 250mg', 'Ibuprofen 400mg', 'Pantoprazole 40mg', 'Metformin 500mg', 'Omeprazole 20mg', 'Cough Syrup'] },
  'wellness-otc': { name: 'Wellness / OTC', dept: 'Pharmacy', appliesTo: 'generic', axes: [], attrs: [A('brand', 'Brand', 'string')], keyword: 'supplements', price: [50, 900], brands: ['Himalaya', 'Dabur', 'HealthKart', 'Revital'], names: ['Vitamin C Tablets', 'Multivitamin', 'Antacid', 'Hand Sanitizer', 'Pain Relief Balm', 'ORS Powder', 'Calcium Tablets', 'Protein Powder'] },
  // Watches
  'wrist-watches': { name: 'Wrist Watches', dept: 'Watches', appliesTo: 'generic', axes: ['color'], attrs: [A('brand', 'Brand', 'string'), A('movement', 'Movement', 'enum', ['Quartz', 'Automatic', 'Digital'])], keyword: 'wristwatch', price: [899, 7999], brands: ['Titan', 'Casio', 'Fossil', 'Fastrack', 'Sonata', 'Timex'], names: ['Analog Watch', 'Chronograph Watch', 'Digital Watch', 'Automatic Watch', 'Sports Watch', 'Dress Watch'] },
  // Electronics
  'smartphones': { name: 'Smartphones', dept: 'Electronics', appliesTo: 'generic', axes: ['color', 'storage'], attrs: [A('brand', 'Brand', 'string'), A('ram', 'RAM', 'enum', ['4GB', '6GB', '8GB', '12GB'])], keyword: 'smartphone', price: [8999, 79999], brands: ['Samsung', 'Xiaomi', 'Apple', 'Realme', 'OnePlus', 'Vivo', 'Poco'], names: ['5G Smartphone', 'Pro Max Phone', 'Note Series Phone', 'Neo Phone', 'Ultra Phone', 'Lite Phone'] },
  'laptops': { name: 'Laptops', dept: 'Electronics', appliesTo: 'generic', axes: [], attrs: [A('brand', 'Brand', 'string'), A('ram', 'RAM', 'enum', ['8GB', '16GB']), A('processor', 'Processor', 'enum', ['i5', 'i7', 'Ryzen 5'])], keyword: 'laptop', price: [29999, 99999], brands: ['HP', 'Dell', 'Lenovo', 'Asus', 'Acer'], names: ['Core i5 Laptop', 'Gaming Laptop', 'ThinBook', 'Business Laptop', 'Chromebook'] },
  'audio': { name: 'Audio', dept: 'Electronics', appliesTo: 'generic', axes: ['color'], attrs: [A('brand', 'Brand', 'string'), A('type', 'Type', 'enum', ['Earbuds', 'Headphones', 'Speaker'])], keyword: 'headphones', price: [499, 7999], brands: ['boAt', 'JBL', 'Sony', 'Noise', 'Realme'], names: ['Wireless Earbuds', 'Over-Ear Headphones', 'Bluetooth Speaker', 'Neckband', 'Gaming Headset'] },
  // Fashion — Men (existing leaves)
  'shirts': { name: 'Shirts', dept: 'Fashion', group: "Men's Wear", appliesTo: 'fashion', axes: ['size', 'color'], attrs: [A('brand', 'Brand', 'string'), A('fabric', 'Fabric', 'enum', ['Cotton', 'Linen', 'Polyester'])], keyword: 'shirt', price: [699, 1999], brands: ['Allen Solly', 'Peter England', 'Van Heusen', 'Arrow', 'US Polo'], names: ['Formal Shirt', 'Casual Shirt', 'Checked Shirt', 'Printed Shirt', 'Oxford Shirt', 'Linen Shirt'] },
  'jeans': { name: 'Jeans', dept: 'Fashion', group: "Men's Wear", appliesTo: 'fashion', axes: ['size', 'color'], attrs: [A('brand', 'Brand', 'string')], keyword: 'jeans', price: [1299, 2999], brands: ['Levis', 'Wrangler', 'Pepe', 'Spykar', 'Lee'], names: ['Slim Fit Jeans', 'Regular Jeans', 'Bootcut Jeans', 'Stretch Jeans'] },
  't-shirts': { name: 'T-Shirts', dept: 'Fashion', group: "Men's Wear", appliesTo: 'fashion', axes: ['size', 'color'], attrs: [A('brand', 'Brand', 'string')], keyword: 'tshirt', price: [399, 1299], brands: ['H&M', 'Puma', 'US Polo', 'Jockey'], names: ['Round Neck Tee', 'V-Neck Tee', 'Polo Tee', 'Graphic Tee', 'Sports Tee'] },
  // Fashion — Women (new)
  'kurtis': { name: 'Kurtis', dept: 'Fashion', group: "Women's Wear", appliesTo: 'fashion', axes: ['size', 'color'], attrs: [A('brand', 'Brand', 'string'), A('fabric', 'Fabric', 'enum', ['Cotton', 'Rayon', 'Silk'])], keyword: 'kurti', price: [499, 2499], brands: ['Biba', 'W', 'Libas', 'Aurelia', 'Global Desi'], names: ['Anarkali Kurti', 'Straight Kurti', 'A-Line Kurti', 'Printed Kurti', 'Embroidered Kurti', 'Cotton Kurti'] },
  'sarees': { name: 'Sarees', dept: 'Fashion', group: "Women's Wear", appliesTo: 'fashion', axes: ['color'], attrs: [A('brand', 'Brand', 'string'), A('fabric', 'Fabric', 'enum', ['Silk', 'Cotton', 'Georgette', 'Chiffon'])], keyword: 'saree', price: [999, 9999], brands: ['Nalli', 'Fabindia', 'Mysore Silk', 'Kalyan'], names: ['Silk Saree', 'Cotton Saree', 'Georgette Saree', 'Banarasi Saree', 'Chiffon Saree', 'Kanjivaram Saree'] },
  'dresses': { name: 'Dresses', dept: 'Fashion', group: "Women's Wear", appliesTo: 'fashion', axes: ['size', 'color'], attrs: [A('brand', 'Brand', 'string'), A('fit', 'Fit', 'enum', ['Bodycon', 'A-Line', 'Maxi'])], keyword: 'dress', price: [799, 3499], brands: ['Zara', 'H&M', 'Vero Moda', 'Only'], names: ['Maxi Dress', 'Bodycon Dress', 'A-Line Dress', 'Wrap Dress', 'Floral Dress'] },
  // Fashion — Kids (new)
  'boys-clothing': { name: 'Boys Clothing', dept: 'Fashion', group: 'Kids Wear', appliesTo: 'fashion', axes: ['size', 'color'], attrs: [A('brand', 'Brand', 'string')], keyword: 'kids-boys', price: [299, 999], brands: ['Gini & Jony', 'US Polo Kids', 'Max Kids'], names: ['Boys T-Shirt', 'Boys Shirt', 'Boys Shorts', 'Boys Jeans', 'Boys Kurta'] },
  'girls-clothing': { name: 'Girls Clothing', dept: 'Fashion', group: 'Kids Wear', appliesTo: 'fashion', axes: ['size', 'color'], attrs: [A('brand', 'Brand', 'string')], keyword: 'kids-girl-dress', price: [349, 1199], brands: ['Gini & Jony', 'Max Kids', 'Babyhug'], names: ['Girls Frock', 'Girls Top', 'Girls Dress', 'Girls Skirt', 'Girls Leggings'] },
  'toys': { name: 'Toys', dept: 'Fashion', group: 'Kids Wear', appliesTo: 'generic', axes: [], attrs: [A('brand', 'Brand', 'string'), A('ageGroup', 'Age Group', 'enum', ['0-3', '3-6', '6-12'])], keyword: 'toys', price: [199, 2999], brands: ['Funskool', 'Hamleys', 'Fisher-Price'], names: ['Building Blocks', 'Remote Car', 'Soft Teddy', 'Puzzle Set', 'Doll House', 'Toy Train'] },
};

const DESCRIPTORS = ['Premium', 'Classic', 'Deluxe', 'Special', 'Value Pack', 'Family Pack', 'Fresh', 'Organic', 'Pro', 'Everyday'];

// ── 20 stores → which leaves they stock ──────────────────────────────────────
interface StoreDef { name: string; vendorType: string; leaves: string[] }
const STORES: StoreDef[] = [
  { name: 'Sharma Kirana Store', vendorType: 'grocery', leaves: ['dals-pulses', 'spices-masala', 'atta-flour', 'edible-oil', 'rice-grains'] },
  { name: 'Apna Bazaar Grocery', vendorType: 'grocery', leaves: ['dals-pulses', 'spices-masala', 'rice-grains', 'atta-flour', 'edible-oil'] },
  { name: 'Daily Needs Mart', vendorType: 'grocery', leaves: ['spices-masala', 'dals-pulses', 'edible-oil', 'rice-grains'] },
  { name: 'Spice Route Provisions', vendorType: 'grocery', leaves: ['spices-masala', 'dals-pulses', 'atta-flour'] },
  { name: 'Trendy Threads', vendorType: 'fashion', leaves: ['shirts', 't-shirts', 'jeans'] },
  { name: 'Denim Depot', vendorType: 'fashion', leaves: ['jeans', 't-shirts', 'shirts'] },
  { name: 'Ethnic Elegance', vendorType: 'fashion', leaves: ['kurtis', 'sarees', 'dresses'] },
  { name: 'Saree Sansaar', vendorType: 'fashion', leaves: ['sarees', 'kurtis'] },
  { name: 'Bloom Boutique', vendorType: 'fashion', leaves: ['dresses', 'kurtis'] },
  { name: 'Little Stars Kids', vendorType: 'fashion', leaves: ['boys-clothing', 'girls-clothing', 'toys'] },
  { name: 'Toy & Tots', vendorType: 'fashion', leaves: ['toys', 'boys-clothing', 'girls-clothing'] },
  { name: 'HealthFirst Pharmacy', vendorType: 'generic', leaves: ['medicines', 'wellness-otc'] },
  { name: 'MediPlus Chemist', vendorType: 'generic', leaves: ['medicines', 'wellness-otc'] },
  { name: 'Pizza Palace', vendorType: 'food', leaves: ['pizza', 'burgers-wraps'] },
  { name: 'Biryani House', vendorType: 'food', leaves: ['biryani', 'burgers-wraps'] },
  { name: 'TimeZone Watches', vendorType: 'generic', leaves: ['wrist-watches'] },
  { name: 'WristCraft', vendorType: 'generic', leaves: ['wrist-watches'] },
  { name: 'Gadget Galaxy', vendorType: 'generic', leaves: ['smartphones', 'laptops', 'audio'] },
  { name: 'Mobile Hub', vendorType: 'generic', leaves: ['smartphones', 'audio'] },
  { name: 'Laptop World', vendorType: 'generic', leaves: ['laptops', 'audio'] },
];

// ── category upsert ──────────────────────────────────────────────────────────
type CatDoc = { _id: unknown; name: string; slug: string; attributeSchema: AttrDef[]; variantAxes: string[] };
async function ensureCat(name: string, appliesTo: string, parentId: unknown, attrs: AttrDef[] = [], axes: string[] = []): Promise<CatDoc> {
  const slug = slugify(name);
  const existing = await Category.findOne({ slug });
  if (existing) return existing as unknown as CatDoc;
  const created = await Category.create({ name, slug, appliesTo, parentId: parentId ?? undefined, attributeSchema: attrs, variantAxes: axes });
  logger.info(`  + category: ${name} (${slug})`);
  return created as unknown as CatDoc;
}

async function ensureLeafCategories(): Promise<Record<string, CatDoc>> {
  const deptCache = new Map<string, CatDoc>();
  const out: Record<string, CatDoc> = {};
  for (const [slug, leaf] of Object.entries(LEAVES)) {
    const deptKey = `${leaf.dept}`;
    let dept = deptCache.get(deptKey);
    if (!dept) { dept = await ensureCat(leaf.dept, leaf.appliesTo, null); deptCache.set(deptKey, dept); }
    let parent = dept;
    if (leaf.group) {
      const gkey = `${leaf.dept}>${leaf.group}`;
      let grp = deptCache.get(gkey);
      if (!grp) { grp = await ensureCat(leaf.group, leaf.appliesTo, dept._id); deptCache.set(gkey, grp); }
      parent = grp;
    }
    out[slug] = await ensureCat(leaf.name, leaf.appliesTo, parent._id, leaf.attrs, leaf.axes);
  }
  return out;
}

// ── product generation ───────────────────────────────────────────────────────
function foodTypeOf(title: string): string | undefined {
  if (/chicken|mutton|fish/i.test(title)) return 'non_veg';
  if (/egg/i.test(title)) return 'egg';
  return 'veg';
}

function makeProducts(store: { _id: unknown; slug: string }, leafSlugs: string[], cats: Record<string, CatDoc>, target: number) {
  const docs: Record<string, unknown>[] = [];
  let i = 0;
  while (docs.length < target) {
    const leafSlug = leafSlugs[i % leafSlugs.length]!;
    const leaf = LEAVES[leafSlug]!;
    const cat = cats[leafSlug]!;
    const name = pick(leaf.names);
    const brand = leaf.brands.length ? pick(leaf.brands) : '';
    const desc = Math.random() < 0.5 ? `${pick(DESCRIPTORS)} ` : '';
    const title = `${brand ? brand + ' ' : ''}${desc}${name}`.trim();
    const baseSlug = `${store.slug}-p${i + 1}`;
    const price = priceEnding99(leaf.price[0], leaf.price[1]) * 100; // paise
    const variants = buildVariants(cat.variantAxes ?? leaf.axes, cat.name, baseSlug, price);
    const color = (variants[0]?.optionValues as Record<string, string>)?.['color'] ?? '';
    const attributes = genAttrs((cat.attributeSchema ?? leaf.attrs) as AttrDef[], brand);
    docs.push({
      storeId: store._id,
      categoryId: cat._id,
      title,
      slug: baseSlug,
      description: `${title} — ${leaf.food ? 'freshly made, great taste.' : 'quality product at a great price.'}`,
      brand: brand || undefined,
      images: imgs(leaf.keyword, color, baseSlug),
      attributes,
      variants,
      modifierGroups: [],
      ...(leaf.food ? { foodType: foodTypeOf(title) } : {}),
      status: 'active',
      visibility: 'public',
      minPrice: Math.min(...variants.map((v) => v.price)), // set manually (insertMany bypasses the save hook)
    });
    i++;
  }
  return docs;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function run(): Promise<void> {
  await connectDb();
  logger.info('Ensuring category tree…');
  const cats = await ensureLeafCategories();

  const PW = await bcrypt.hash('12345678', 10);
  const target = Number(process.env.COUNT) || 105;
  let totalProducts = 0;

  for (const def of STORES) {
    const slug = slugify(def.name);
    const email = `${slug}@marketplace.local`;
    let user = await User.findOne({ email });
    if (!user) user = await User.create({ name: def.name, email, passwordHash: PW, role: Role.VENDOR });

    let store = await Store.findOne({ ownerId: user._id });
    if (!store) {
      store = await Store.create({
        ownerId: user._id, name: def.name, slug, vendorType: def.vendorType, status: 'approved',
        description: `${def.name} — your trusted shop for quality ${def.vendorType} products.`,
        logo: imgs(def.vendorType, '', `${slug}-logo`)[0],
        coverImages: imgs(def.vendorType + '-store', '', `${slug}-cover`).slice(0, 2),
        contactEmail: email, contactPhone: `9${rand(100000000, 999999999)}`,
        address: { line1: `Shop ${rand(1, 200)}, Main Market`, city: pick(['Mumbai', 'Delhi', 'Pune', 'Jaipur', 'Indore', 'Surat']), state: 'India', pincode: `${rand(110001, 799999)}` },
      });
    }
    if (String(user.storeId ?? '') !== String(store._id)) { user.set('storeId', store._id); await user.save(); }

    await Product.deleteMany({ storeId: store._id }); // clear old demo products (idempotent)
    const docs = makeProducts({ _id: store._id, slug }, def.leaves, cats, target + rand(0, 15));
    await Product.insertMany(docs);
    totalProducts += docs.length;
    logger.info(`✅ ${def.name.padEnd(24)} | ${email}  (pw 12345678) | ${docs.length} products`);
  }

  logger.info(`\n🎉 Demo seed complete: ${STORES.length} stores, ${totalProducts} products. All vendors password = 12345678`);
  await disconnectDb();
}
void run();
