import { Schema, model, type InferSchemaType } from 'mongoose';

const variantSchema = new Schema(
  {
    sku: { type: String, required: true },
    optionValues: { type: Map, of: String, default: {} },
    price: { type: Number, required: true }, // minor units
    compareAtPrice: Number,
    currency: { type: String, required: true },
    stock: { type: Number, default: 0 },
    trackInventory: { type: Boolean, default: true },
    barcode: String,
    image: String,
    weightGrams: Number,
  },
  { _id: true },
);

const modifierOptionSchema = new Schema(
  { name: { type: String, required: true }, priceDelta: { type: Number, default: 0 } },
  { _id: true },
);
const modifierGroupSchema = new Schema(
  {
    name: { type: String, required: true },
    selection: { type: String, enum: ['single', 'multi'], required: true },
    required: { type: Boolean, default: false },
    min: Number,
    max: Number,
    options: { type: [modifierOptionSchema], default: [] },
  },
  { _id: true },
);

const productSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    title: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, default: '' },
    brand: String,
    images: { type: [String], default: [] },
    foodType: { type: String, enum: ['veg', 'non_veg', 'egg'], index: true }, // India FSSAI marker (optional)
    faqEnabled: { type: Boolean, default: true }, // show Q&A section on the product
    allowBuyerReplies: { type: Boolean, default: true }, // buyers may answer questions (else only vendor/admin)
    attributes: { type: Schema.Types.Mixed, default: {} }, // validated vs category schema in service
    variants: { type: [variantSchema], default: [] },
    modifierGroups: { type: [modifierGroupSchema], default: [] },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft', index: true },
    visibility: { type: String, enum: ['public', 'hidden'], default: 'public' },
    ratingAvg: { type: Number, default: 0, index: true },
    ratingCount: { type: Number, default: 0 },
    salesCount: { type: Number, default: 0, index: true }, // units sold → popularity sort
    minPrice: { type: Number, default: 0, index: true }, // denormalized cheapest variant → price sort/filter
  },
  { timestamps: true },
);

productSchema.index({ title: 'text', description: 'text' });

// Keep minPrice in sync on every save (create/update/stock/publish all go through save).
productSchema.pre('save', function (next) {
  const prices = (this.variants ?? []).map((v) => v.price).filter((p) => typeof p === 'number');
  this.minPrice = prices.length ? Math.min(...prices) : 0;
  next();
});

export type ProductDoc = InferSchemaType<typeof productSchema>;
export const Product = model('Product', productSchema);
