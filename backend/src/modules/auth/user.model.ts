import { Schema, model, type InferSchemaType } from 'mongoose';
import { Role } from '@app/shared';

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    phone: { type: String },
    emailVerified: { type: Boolean, default: false },
    otpCode: { type: String },
    otpExpires: { type: Date },
    resetCode: { type: String },
    resetExpires: { type: Date },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: Object.values(Role),
      default: Role.CUSTOMER,
      index: true,
    },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    customPermissions: {
      add: { type: [String], default: [] },
      remove: { type: [String], default: [] },
    },
    status: { type: String, enum: ['active', 'suspended', 'invited'], default: 'active' },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
