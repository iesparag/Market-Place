import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Storage for the **dev mock gateway** only.
 *
 * A real gateway is an external system that remembers its orders and payments across
 * our restarts. The mock has to do the same, otherwise a `tsx watch` reload would make
 * already-settled payments un-refundable — a bug that only exists in dev but wastes
 * real time. Nothing outside `mock.provider.ts` should read these collections.
 */
const mockOrderSchema = new Schema(
  {
    providerOrderId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
  },
  { timestamps: true },
);

const mockPaymentSchema = new Schema(
  {
    providerPaymentId: { type: String, required: true, unique: true },
    providerOrderId: { type: String, required: true, index: true },
    status: { type: String, default: 'captured' },
    amount: { type: Number, required: true },
    amountRefunded: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    method: { type: String, default: 'upi' },
    captured: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type MockGatewayOrderDoc = InferSchemaType<typeof mockOrderSchema>;
export type MockGatewayPaymentDoc = InferSchemaType<typeof mockPaymentSchema>;
export const MockGatewayOrder = model('MockGatewayOrder', mockOrderSchema);
export const MockGatewayPayment = model('MockGatewayPayment', mockPaymentSchema);
