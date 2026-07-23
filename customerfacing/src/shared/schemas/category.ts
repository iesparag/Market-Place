import { z } from 'zod';
import { AttributeTypeEnum, VendorTypeEnum } from '../enums/index.js';

/** One attribute definition inside a category's schema. */
export const AttributeDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: AttributeTypeEnum,
  required: z.boolean().default(false),
  unit: z.string().optional(),
  options: z.array(z.string()).optional(), // enum / multi-enum
  min: z.number().optional(),
  max: z.number().optional(),
  filterable: z.boolean().default(false),
  searchable: z.boolean().default(false),
});
export type AttributeDef = z.infer<typeof AttributeDefSchema>;

export const CategorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  parentId: z.string().optional(),
  appliesTo: VendorTypeEnum,
  attributeSchema: z.array(AttributeDefSchema).default([]),
  variantAxes: z.array(z.string()).default([]),
});
export type Category = z.infer<typeof CategorySchema>;

export const CreateCategorySchema = CategorySchema;
export const UpdateCategorySchema = CategorySchema.partial();
