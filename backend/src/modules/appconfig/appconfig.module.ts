import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppConfig, getAppConfigDoc, getAppConfigPublic } from './appconfig.model.js';
import { PALETTE_PRESETS } from './palette-presets.js';

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
    themeDark: z
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
    themePresetId: z.string().trim().optional(),
  })
  .strict();

const ApplyPresetSchema = z.object({ presetId: z.string().min(1) });

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

// 32 curated light+dark pairs — lets the admin pick a ready-made palette instead of
// hand-typing 12 hex codes. Admin-only: no reason for this list to be public.
appConfigRoutes.get(
  '/config/presets',
  authenticate,
  authorize('settings:manage'),
  asyncHandler(async (_req, res) => {
    ok(res, PALETTE_PRESETS);
  }),
);

appConfigRoutes.post(
  '/config/presets/apply',
  authenticate,
  authorize('settings:manage'),
  asyncHandler(async (req, res) => {
    const { presetId } = ApplyPresetSchema.parse(req.body);
    const preset = PALETTE_PRESETS.find((p) => p.id === presetId);
    if (!preset) throw AppError.notFound('Preset not found');
    const doc = await AppConfig.findOneAndUpdate(
      { key: 'app' },
      {
        $set: {
          'theme.primary': preset.light.primary,
          'theme.primaryDark': preset.light.primaryDark,
          'theme.soft': preset.light.soft,
          'theme.gradientStart': preset.light.gradientStart,
          'theme.gradientEnd': preset.light.gradientEnd,
          'theme.canvas': preset.light.canvas,
          'themeDark.primary': preset.dark.primary,
          'themeDark.primaryDark': preset.dark.primaryDark,
          'themeDark.soft': preset.dark.soft,
          'themeDark.gradientStart': preset.dark.gradientStart,
          'themeDark.gradientEnd': preset.dark.gradientEnd,
          'themeDark.canvas': preset.dark.canvas,
          themePresetId: preset.id,
        },
        $setOnInsert: { key: 'app' },
      },
      { new: true, upsert: true },
    ).lean();
    ok(res, doc);
  }),
);

appConfigRoutes.patch(
  '/config/admin',
  authenticate,
  authorize('settings:manage'),
  asyncHandler(async (req, res) => {
    const patch = UpdateSchema.parse(req.body);
    // Flatten `theme.*`/`themeDark.*` to dotted paths so we only overwrite the provided keys.
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if ((k === 'theme' || k === 'themeDark') && v && typeof v === 'object') {
        for (const [tk, tv] of Object.entries(v)) set[`${k}.${tk}`] = tv;
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
