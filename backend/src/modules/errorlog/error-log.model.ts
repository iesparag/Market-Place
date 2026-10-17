import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Every response that passed through the global error middleware (errorHandler),
 * so failures are queryable instead of living only in stdout/pino. Written
 * fire-and-forget from the handler — a DB write failure here must never affect
 * the error response already sent to the client.
 */
const errorLogSchema = new Schema(
  {
    method: { type: String, required: true },
    path: { type: String, required: true, index: true },
    statusCode: { type: Number, required: true, index: true },
    code: { type: String, required: true },
    message: { type: String, required: true },
    stack: String,
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    ip: String,
    query: { type: Schema.Types.Mixed },
    params: { type: Schema.Types.Mixed },
    body: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

errorLogSchema.index({ createdAt: -1 });
errorLogSchema.index({ path: 1, statusCode: 1, createdAt: -1 });

export type ErrorLogDoc = InferSchemaType<typeof errorLogSchema>;
export const ErrorLog = model('ErrorLog', errorLogSchema);
