import bcrypt from 'bcryptjs';
import { Role } from '@app/shared';
import { connectDb, disconnectDb } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { User } from '../../modules/auth/user.model.js';
import { Category } from '../../modules/categories/category.model.js';
import { Store } from '../../modules/stores/store.model.js';
import { Product } from '../../modules/products/product.model.js';
import { Coupon } from '../../modules/coupons/coupons.module.js';
import { Banner } from '../../modules/banners/banners.module.js';

// Demo product photos (multi-image gallery). Real photos come via admin upload later.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=800&q=80&auto=format&fit=crop`;
const PIZZA_IMGS = ['1513104890138-7c749659a591', '1565299624946-b28f40a0ae38', '1594007654729-407eedc4be65', '1574071318508-1cdbab80d002'].map(U);
const RICE_IMGS = ['1586201375761-83865001e31c', '1516684732162-798a0062be99', '1536304993881-ff6e9eefa2a6'].map(U);

async function upsertUser(email: string, name: string, role: string, storeId?: unknown) {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash('password123', 10),
      role,
      storeId,
    });
    logger.info(`Seeded ${role}: ${email} / password123`);
  }
  return user;
}

async function upsertCategory(slug: string, data: Record<string, unknown>) {
  let cat = await Category.findOne({ slug });
  if (!cat) cat = await Category.create({ slug, ...data });
  return cat;
}

/** Create a category (or reparent an existing one) — idempotent, used to build the demo tree. */
async function ensureCat(slug: string, name: string, appliesTo: string, parentId?: unknown) {
  const existing = await Category.findOne({ slug });
  if (existing) {
    if (parentId && String(existing.parentId ?? '') !== String(parentId)) {
      existing.parentId = parentId as never;
      await existing.save();
    }
    return existing;
  }
  return Category.create({ slug, name, appliesTo, parentId, attributeSchema: [], variantAxes: [] });
}

interface CatSeed { slug: string; name: string; appliesTo?: string; children?: CatSeed[] }
async function insertTree(nodes: CatSeed[], parentId: unknown, appliesTo: string): Promise<void> {
  for (const n of nodes) {
    const applies = n.appliesTo ?? appliesTo;
    const cat = await ensureCat(n.slug, n.name, applies, parentId ?? undefined);
    if (n.children?.length) await insertTree(n.children, cat._id, applies);
  }
}

/** Department → sub-category tree that powers the storefront mega-menu (demo data). */
const DEPARTMENTS: CatSeed[] = [
  {
    slug: 'food-beverages', name: 'Food & Beverages', appliesTo: 'food', children: [
      { slug: 'pizza', name: 'Pizza' }, // existing (has products) → reparented here
      { slug: 'burgers', name: 'Burgers & Wraps' },
      { slug: 'beverages', name: 'Beverages' },
      { slug: 'desserts', name: 'Desserts' },
    ],
  },
  {
    slug: 'grocery-dept', name: 'Grocery', appliesTo: 'grocery', children: [
      { slug: 'rice', name: 'Rice' }, // existing (has products) → reparented here
      { slug: 'atta-flours', name: 'Atta & Flours' },
      { slug: 'edible-oils', name: 'Edible Oils' },
      { slug: 'snacks', name: 'Snacks & Namkeen' },
      { slug: 'spices', name: 'Spices & Masala' },
    ],
  },
  {
    slug: 'fashion', name: 'Fashion', appliesTo: 'fashion', children: [
      { slug: 'men', name: 'Men', children: [
        { slug: 'mens-tshirts', name: 'T-Shirts' }, { slug: 'mens-shirts', name: 'Shirts' },
        { slug: 'mens-jeans', name: 'Jeans' }, { slug: 'mens-shoes', name: 'Shoes' },
      ] },
      { slug: 'women', name: 'Women', children: [
        { slug: 'womens-dresses', name: 'Dresses' }, { slug: 'womens-tops', name: 'Tops & Tees' },
        { slug: 'womens-sarees', name: 'Sarees' }, { slug: 'womens-footwear', name: 'Footwear' },
      ] },
      { slug: 'kids', name: 'Kids', children: [
        { slug: 'kids-boys', name: 'Boys Clothing' }, { slug: 'kids-girls', name: 'Girls Clothing' },
        { slug: 'kids-toys', name: 'Toys' },
      ] },
    ],
  },
  {
    slug: 'electronics', name: 'Electronics', appliesTo: 'generic', children: [
      { slug: 'mobiles', name: 'Mobiles', children: [
        { slug: 'smartphones', name: 'Smartphones' }, { slug: 'mobile-accessories', name: 'Accessories' },
      ] },
      { slug: 'laptops', name: 'Laptops & Computers' },
      { slug: 'audio', name: 'Audio', children: [
        { slug: 'headphones', name: 'Headphones' }, { slug: 'speakers', name: 'Speakers' },
      ] },
      { slug: 'wearables', name: 'Smart Watches' },
    ],
  },
  {
    slug: 'home-kitchen', name: 'Home & Kitchen', appliesTo: 'generic', children: [
      { slug: 'cookware', name: 'Cookware & Bakeware' },
      { slug: 'kitchen-storage', name: 'Kitchen Storage' },
      { slug: 'home-decor', name: 'Home Décor' },
      { slug: 'furnishing', name: 'Bed & Bath' },
    ],
  },
  {
    slug: 'beauty', name: 'Beauty & Personal Care', appliesTo: 'generic', children: [
      { slug: 'skincare', name: 'Skincare' }, { slug: 'haircare', name: 'Hair Care' },
      { slug: 'makeup', name: 'Makeup' }, { slug: 'fragrances', name: 'Fragrances' },
    ],
  },
];

async function seed(): Promise<void> {
  await connectDb();

  // --- super admin ---
  await upsertUser('admin@marketplace.local', 'Super Admin', Role.SUPER_ADMIN);

  // --- categories with attribute schemas ---
  const pizzaCat = await upsertCategory('pizza', {
    name: 'Pizza',
    appliesTo: 'food',
    attributeSchema: [
      { key: 'cuisine', label: 'Cuisine', type: 'string', required: false, filterable: true },
      { key: 'veg', label: 'Vegetarian', type: 'boolean', required: true, filterable: true },
    ],
    variantAxes: ['size'],
  });
  const riceCat = await upsertCategory('rice', {
    name: 'Rice',
    appliesTo: 'grocery',
    attributeSchema: [
      { key: 'brand', label: 'Brand', type: 'string', required: false, filterable: true },
      { key: 'organic', label: 'Organic', type: 'boolean', required: false, filterable: true },
    ],
    variantAxes: ['weight'],
  });

  // --- department hierarchy for the mega-menu (also reparents pizza/rice under their departments) ---
  await insertTree(DEPARTMENTS, undefined, 'generic');
  logger.info('Seeded category department tree (mega-menu)');

  // --- vendor + approved store ---
  const vendor = await upsertUser('vendor@marketplace.local', 'Tasty Foods', Role.VENDOR);
  let store = await Store.findOne({ ownerId: vendor._id });
  if (!store) {
    store = await Store.create({
      ownerId: vendor._id,
      name: 'Tasty Foods',
      slug: 'tasty-foods',
      vendorType: 'food',
      status: 'approved',
      description: 'Wood-fired pizzas and daily grocery staples.',
    });
    vendor.storeId = store._id;
    await vendor.save();
    logger.info('Seeded store: tasty-foods (approved)');
  }

  // --- products ---
  const productCount = await Product.countDocuments({ storeId: store._id });
  if (productCount === 0) {
    await Product.create({
      storeId: store._id,
      categoryId: pizzaCat._id,
      title: 'Margherita Pizza',
      slug: 'margherita-pizza',
      description: 'Classic hand-tossed pizza with fresh basil and mozzarella.',
      brand: 'Tasty Foods',
      images: [],
      attributes: { cuisine: 'Italian', veg: true },
      variants: [
        { sku: 'marg-s', optionValues: { size: 'Small' }, price: 24900, currency: 'INR', stock: 50 },
        { sku: 'marg-m', optionValues: { size: 'Medium' }, price: 34900, currency: 'INR', stock: 50 },
        { sku: 'marg-l', optionValues: { size: 'Large' }, price: 44900, currency: 'INR', stock: 50 },
      ],
      modifierGroups: [
        {
          name: 'Cheese',
          selection: 'single',
          required: false,
          options: [
            { name: 'Extra Cheese', priceDelta: 5000 },
            { name: 'Double Cheese', priceDelta: 9000 },
          ],
        },
        {
          name: 'Toppings',
          selection: 'multi',
          required: false,
          options: [
            { name: 'Olives', priceDelta: 3000 },
            { name: 'Mushroom', priceDelta: 3500 },
            { name: 'Jalapeno', priceDelta: 2500 },
          ],
        },
      ],
      status: 'active',
      visibility: 'public',
    });

    await Product.create({
      storeId: store._id,
      categoryId: pizzaCat._id,
      title: 'Farmhouse Pizza',
      slug: 'farmhouse-pizza',
      description: 'Loaded with veggies — capsicum, onion, tomato, mushroom.',
      brand: 'Tasty Foods',
      attributes: { cuisine: 'Italian', veg: true },
      variants: [
        { sku: 'farm-m', optionValues: { size: 'Medium' }, price: 39900, currency: 'INR', stock: 40 },
        { sku: 'farm-l', optionValues: { size: 'Large' }, price: 49900, currency: 'INR', stock: 40 },
      ],
      modifierGroups: [
        {
          name: 'Cheese',
          selection: 'single',
          required: false,
          options: [{ name: 'Extra Cheese', priceDelta: 5000 }],
        },
      ],
      status: 'active',
      visibility: 'public',
    });

    await Product.create({
      storeId: store._id,
      categoryId: riceCat._id,
      title: 'Basmati Rice',
      slug: 'basmati-rice',
      description: 'Long-grain aromatic basmati rice.',
      brand: 'Farm Fresh',
      attributes: { brand: 'Farm Fresh', organic: false },
      variants: [
        { sku: 'rice-500', optionValues: { weight: '500g' }, price: 6000, currency: 'INR', stock: 100 },
        { sku: 'rice-1000', optionValues: { weight: '1kg' }, price: 11000, currency: 'INR', stock: 100 },
        { sku: 'rice-5000', optionValues: { weight: '5kg' }, price: 52000, currency: 'INR', stock: 40 },
      ],
      modifierGroups: [],
      status: 'active',
      visibility: 'public',
    });

    logger.info('Seeded 3 products (2 pizzas, 1 rice)');
  }

  // --- demo coupon ---
  if (!(await Coupon.findOne({ code: 'SAVE10' }))) {
    await Coupon.create({ code: 'SAVE10', type: 'percent', value: 10, minSubtotal: 20000, maxDiscount: 15000, active: true });
    logger.info('Seeded coupon: SAVE10 (10% off, min ₹200, max ₹150)');
  }

  // --- demo carousel banners ---
  if ((await Banner.countDocuments()) === 0) {
    await Banner.create([
      { title: 'Fresh pizzas, hot deals 🍕', subtitle: 'Up to 30% off from Tasty Foods', ctaText: 'Order now', link: '/catalog?category=pizza', bg: '#ea580c', order: 0, active: true },
      { title: 'Groceries at your door 🛒', subtitle: 'Daily staples, doorstep delivery', ctaText: 'Shop grocery', link: '/catalog?category=rice', bg: '#16a34a', order: 1, active: true },
      { title: 'Top rated picks ⭐', subtitle: 'Loved by customers across vendors', ctaText: 'Explore', link: '/catalog?sort=rating', bg: '#7c3aed', order: 2, active: true },
    ]);
    logger.info('Seeded 3 carousel banners');
  }

  // Backfill demo images (if missing) + minPrice (pre-save hook recomputes it).
  for (const p of await Product.find()) {
    if (!p.images || p.images.length === 0) {
      p.images = p.title.toLowerCase().includes('rice') ? RICE_IMGS : PIZZA_IMGS;
    }
    await p.save();
  }
  logger.info('Backfilled product images + minPrice');

  logger.info('Seed complete');
  await disconnectDb();
}

void seed();
