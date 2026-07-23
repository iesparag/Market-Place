import { Schema, model, type InferSchemaType } from 'mongoose';

const attributeDefSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, required: true },
    required: { type: Boolean, default: false },
    unit: String,
    options: [String],
    min: Number,
    max: Number,
    filterable: { type: Boolean, default: false },
    searchable: { type: Boolean, default: false },
  },
  { _id: false },
);

const categorySchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category' },
    appliesTo: { type: String, required: true },
    attributeSchema: { type: [attributeDefSchema], default: [] },
    variantAxes: { type: [String], default: [] },
  },
  { timestamps: true },
);

export type CategoryDoc = InferSchemaType<typeof categorySchema>;
export const Category = model('Category', categorySchema);
