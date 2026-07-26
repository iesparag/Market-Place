import { Schema, model, type InferSchemaType } from 'mongoose';
import { env } from '../../config/env.js';

/**
 * Singleton config the mobile app reads on launch. Editable by super_admin from
 * the dashboard (Appearance) so the whole app can be re-themed / version-gated
 * without a rebuild. Empty string = "fall back to the built-in default".
 */
const appConfigSchema = new Schema(
  {
    key: { type: String, default: 'app', unique: true },

    // Version gate (force-update). Empty → fall back to env.
    minVersion: { type: String, default: '' },
    latestVersion: { type: String, default: '' },
    updateUrl: { type: String, default: '' },
    updateMessage: { type: String, default: '' },

    // Launch "advertisement" card.
    adTitle: { type: String, default: 'Everything at one place' },
    adSubtitle: {
      type: String,
      default:
        'Groceries, fashion, electronics, food & more — one cart, one checkout.',
    },

    // Theme tokens (hex, e.g. "#0B8A45"). Empty → the app uses its green default.
    // Only `primary` is really needed; the app derives the rest if the others are blank.
    theme: {
      primary: { type: String, default: '' },
      primaryDark: { type: String, default: '' },
      soft: { type: String, default: '' },
      gradientStart: { type: String, default: '' },
      gradientEnd: { type: String, default: '' },
      canvas: { type: String, default: '' },
    },
  },
  { timestamps: true },
);

export type AppConfigDoc = InferSchemaType<typeof appConfigSchema>;
export const AppConfig = model('AppConfig', appConfigSchema);

/** The singleton doc, creating it on first read. */
export async function getAppConfigDoc() {
  return AppConfig.findOneAndUpdate(
    { key: 'app' },
    { $setOnInsert: { key: 'app' } },
    { new: true, upsert: true },
  ).lean();
}

/** Shape returned to the app — DB values with env fallbacks for the version gate. */
export async function getAppConfigPublic() {
  const doc = await getAppConfigDoc();
  const theme = (doc?.theme ?? {}) as Record<string, string>;
  return {
    minVersion: doc?.minVersion || env.APP_MIN_VERSION,
    latestVersion: doc?.latestVersion || env.APP_LATEST_VERSION,
    updateUrl: doc?.updateUrl || env.APP_UPDATE_URL,
    updateMessage: doc?.updateMessage || env.APP_UPDATE_MESSAGE,
    ad: {
      title: doc?.adTitle ?? '',
      subtitle: doc?.adSubtitle ?? '',
    },
    theme: {
      primary: theme.primary ?? '',
      primaryDark: theme.primaryDark ?? '',
      soft: theme.soft ?? '',
      gradientStart: theme.gradientStart ?? '',
      gradientEnd: theme.gradientEnd ?? '',
      canvas: theme.canvas ?? '',
    },
  };
}
