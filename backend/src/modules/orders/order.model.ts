import { Schema, model, type InferSchemaType } from 'mongoose';

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    title: String,
    variantSku: String,
    variantLabel: String,
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true }, // minor units, incl. modifiers
    modifiers: [{ name: String, priceDelta: Number }],
    lineTotal: { type: Number, required: true },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], default: [] },
    storeIds: { type: [Schema.Types.ObjectId], index: true }, // for vendor filtering
    couponCode: String,
    amounts: {
      itemsTotal: Number,
      discount: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      delivery: { type: Number, default: 0 },
      grandTotal: Number,
    },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'],
      default: 'pending',
      index: true,
    },
    payment: { method: String, paidAt: Date },
    // Per-store commission snapshot (frozen at pay time — later rate changes don't rewrite history).
    commissions: [
      {
        storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
        subtotal: Number,
        rate: Number,
        amount: Number,
        payable: Number,
      },
    ],
    contact: { name: String, phone: String, email: String },
    shippingAddress: { line1: String, city: String, pincode: String },
  },
  { timestamps: true },
);

export type OrderDoc = InferSchemaType<typeof orderSchema>;
export const Order = model('Order', orderSchema);
