import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { User } from '../auth/user.model.js';

const auditSchema = new Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true }, // e.g. 'store:approve', 'order:refund'
    targetType: String,
    targetId: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: false },
);
export type AuditDoc = InferSchemaType<typeof auditSchema>;
export const Audit = model('AuditLog', auditSchema);

/** Fire-and-forget audit write — never breaks the action it records. */
export function writeAudit(
  actorId: string | undefined,
  action: string,
  opts: { targetType?: string; targetId?: string; meta?: unknown } = {},
): void {
  Audit.create({ actorId, action, ...opts }).catch(() => {
    /* ignore */
  });
}

export const auditRoutes = Router();

auditRoutes.get(
  '/',
  authenticate,
  authorize('audit:read'),
  asyncHandler(async (_req, res) => {
    const rows = await Audit.find().sort({ at: -1 }).limit(300).lean();
    const actors = await User.find({ _id: { $in: rows.map((r) => r.actorId).filter(Boolean) } })
      .select('name email')
      .lean();
    const map = new Map(actors.map((a) => [String(a._id), a]));
    ok(
      res,
      rows.map((r) => ({ ...r, actor: r.actorId ? (map.get(String(r.actorId))?.name ?? 'unknown') : 'system' })),
    );
  }),
);
