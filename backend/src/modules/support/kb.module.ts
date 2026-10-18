import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@app/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { KbDoc } from './kb-doc.model.js';

/** `/support/kb` — admin/vendor CRUD for policy/FAQ/how-to content. See kb-doc.model.ts. */
export const kbRoutes = Router();
kbRoutes.use(authenticate, authorize('kb:manage'));

const isVendor = (role: string) => role === Role.VENDOR || role === Role.VENDOR_STAFF;

const DocSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
  category: z.enum(['policy', 'faq', 'howto', 'other']).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  active: z.boolean().optional(),
  // A vendor can only ever write their own store's docs — their storeId is forced
  // server-side below regardless of what's sent. Admin may set it (or leave it unset
  // for a platform-wide doc).
  storeId: z.string().optional(),
});

kbRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const filter: Record<string, unknown> = {};
    if (isVendor(user.role)) {
      // A vendor manages their own docs, but should still see platform-wide ones for reference.
      filter.$or = [{ storeId: user.storeId }, { storeId: { $exists: false } }];
    } else if (typeof req.query.storeId === 'string') {
      filter.storeId = req.query.storeId;
    }
    if (typeof req.query.category === 'string') filter.category = req.query.category;
    ok(res, await KbDoc.find(filter).sort({ updatedAt: -1 }).lean());
  }),
);

kbRoutes.post(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const input = DocSchema.parse(req.body);
    const storeId = isVendor(user.role) ? user.storeId : input.storeId;
    created(res, await KbDoc.create({ ...input, storeId, createdBy: user.id }));
  }),
);

kbRoutes.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const doc = await KbDoc.findById(req.params.id);
    if (!doc) throw AppError.notFound('Doc not found');
    if (isVendor(user.role) && String(doc.storeId) !== user.storeId) throw AppError.forbidden('Not your doc');
    const input = DocSchema.partial().parse(req.body);
    // A vendor can never move a doc to another store or make it platform-wide.
    if (isVendor(user.role)) delete input.storeId;
    doc.set(input);
    await doc.save();
    ok(res, doc);
  }),
);

kbRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const doc = await KbDoc.findById(req.params.id);
    if (!doc) throw AppError.notFound('Doc not found');
    if (isVendor(user.role) && String(doc.storeId) !== user.storeId) throw AppError.forbidden('Not your doc');
    await doc.deleteOne();
    ok(res, { deleted: true });
  }),
);
