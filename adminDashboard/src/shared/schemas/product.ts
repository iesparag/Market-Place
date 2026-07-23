import { z } from 'zod';
import { CurrencyEnum } from '../enums/index.js';
import { MoneySchema } from './common.js';

/** A purchasable SKU: grocery 500g/1000g, clothes S/M/L, etc. */
export const VariantSchema = z.object({
  sku: z.string().min(1),
  optionValues: z.record(z.string()), // { weight: "500g" } | { size: "M", color: "Red" }
  price: MoneySchema,
  compareAtPrice: MoneySchema.optional(),
  currency: CurrencyEnum,
  stock: z.number().int().nonnegative().default(0),
  trackInventory: z.boolean().default(true),
  barcode: z.string().optional(),
  image: z.string().url().optional(),
  weightGrams: z.number().int().nonnegative().optional(),
});
export type Variant = z.infer<typeof VariantSchema>;

/** A customization applied at cart time: pizza extra/double cheese. */
export const ModifierOptionSchema = z.object({
  name: z.string().min(1),
  priceDelta: z.number().int(), // minor units; can be 0
});
export const ModifierGroupSchema = z.object({
  name: z.string().min(1),
  selection: z.enum(['single', 'multi']),
  required: z.boolean().default(false),
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().nonnegative().optional(),
  options: z.array(ModifierOptionSchema).min(1),
});
export type ModifierGroup = z.infer<typeof ModifierGroupSchema>;

/**
 * Static product shape. The dynamic `attributes` map is validated separately
 * against the product's category attributeSchema (see backend products.service).
 */
export const ProductSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().default(''),
  brand: z.string().optional(),
  images: z.array(z.string().url()).default([]),
  attributes: z.record(z.unknown()).default({}),
  variants: z.array(VariantSchema).min(1),
  modifierGroups: z.array(ModifierGroupSchema).default([]),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  visibility: z.enum(['public', 'hidden']).default('public'),
});
export type Product = z.infer<typeof ProductSchema>;

export const CreateProductSchema = ProductSchema;
export const UpdateProductSchema = ProductSchema.partial();
