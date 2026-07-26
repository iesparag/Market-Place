import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppConfig, getAppConfigDoc, getAppConfigPublic } from './appconfig.model.js';

/**
 * `/app/config`
 *  - GET  /config        (public) → version gate + launch ad + theme tokens the app reads.
 *  - GET  /config/admin  (super_admin) → the raw editable doc for the dashboard.
 *  - PATCH /config/admin (super_admin) → update theme / version / ad. App picks it up next launch.
 */
export const appConfigRoutes = Router();

// #RRGGBB or empty ("" = use the app's built-in default).
const hex = z
  .string()
  .trim()
  .regex(/^(#([0-9a-fA-F]{6}))?$/, 'Use a #RRGGBB hex colour');

const UpdateSchema = z
  .object({
    minVersion: z.string().trim().optional(),
    latestVersion: z.string().trim().optional(),
    updateUrl: z.string().trim().optional(),
    updateMessage: z.string().trim().optional(),
    adTitle: z.string().trim().optional(),
    adSubtitle: z.string().trim().optional(),
    theme: z
      .object({
        primary: hex,
        primaryDark: hex,
        soft: hex,
        gradientStart: hex,
        gradientEnd: hex,
        canvas: hex,
      })
      .partial()
      .optional(),
  })
  .strict();

appConfigRoutes.get(
  '/config',
  asyncHandler(async (_req, res) => {
    ok(res, await getAppConfigPublic());
  }),
);

appConfigRoutes.get(
  '/config/admin',
  authenticate,
  authorize('settings:manage'),
  asyncHandler(async (_req, res) => {
    ok(res, await getAppConfigDoc());
  }),
);

appConfigRoutes.patch(
  '/config/admin',
  authenticate,
  authorize('settings:manage'),
  asyncHandler(async (req, res) => {
    const patch = UpdateSchema.parse(req.body);
    // Flatten `theme.*` to dotted paths so we only overwrite the provided keys.
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'theme' && v && typeof v === 'object') {
        for (const [tk, tv] of Object.entries(v)) set[`theme.${tk}`] = tv;
      } else {
        set[k] = v;
      }
    }
    const doc = await AppConfig.findOneAndUpdate(
      { key: 'app' },
      { $set: set, $setOnInsert: { key: 'app' } },
      { new: true, upsert: true },
    ).lean();
    ok(res, doc);
  }),
);
