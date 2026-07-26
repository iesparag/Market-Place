import { Router } from 'express';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { env } from '../../config/env.js';

/**
 * Public config the mobile app reads on launch:
 *  - version gate (force-update) — the app compares its version to minVersion
 *  - a launch "advertisement" card (managed via env / later admin)
 */
export const appConfigRoutes = Router();

appConfigRoutes.get('/config', asyncHandler(async (_req, res) => {
  ok(res, {
    minVersion: env.APP_MIN_VERSION,
    latestVersion: env.APP_LATEST_VERSION,
    updateUrl: env.APP_UPDATE_URL,
    updateMessage: env.APP_UPDATE_MESSAGE,
    ad: {
      title: 'Everything at one place',
      subtitle: 'Groceries, fashion, electronics, food & more — one cart, one checkout.',
    },
    // Theme hook (future: admin-managed). App falls back to its built-in brand if empty.
    theme: { primary: '', ink: '' },
  });
}));
