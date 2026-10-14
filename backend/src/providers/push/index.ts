import admin from 'firebase-admin';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  /** Big-picture / hero image — rendered natively by Android & iOS once the device
   * downloads it, no extra client code needed (foreground-in-app pushes excepted). */
  imageUrl?: string;
  data?: Record<string, string>;
}

const fcmConfigured = Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
let app: admin.app.App | null = null;
function getApp(): admin.app.App {
  if (!app) {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        // .env stores newlines as literal "\n" — restore them.
        privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return app;
}

/**
 * Firebase Cloud Messaging when configured, otherwise logs (dev / no Flutter app yet).
 * Set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY from a service-account JSON.
 */
export const pushProvider = {
  async send(msg: PushMessage): Promise<void> {
    if (!msg.tokens.length) return;
    if (!fcmConfigured) {
      logger.info({ count: msg.tokens.length, title: msg.title }, '[push] would send FCM push — set FIREBASE_* to deliver');
      return;
    }
    try {
      await getApp().messaging().sendEachForMulticast({
        tokens: msg.tokens,
        notification: { title: msg.title, body: msg.body, imageUrl: msg.imageUrl },
        // Android renders the image as a big-picture notification automatically from
        // `notification.imageUrl` above; this block is only needed for iOS, which
        // requires a Notification Service Extension to actually download + attach it
        // (not built — this app has no iOS release target yet) — harmless to send either way.
        android: msg.imageUrl ? { notification: { imageUrl: msg.imageUrl } } : undefined,
        apns: msg.imageUrl
          ? { payload: { aps: { 'mutable-content': 1 } }, fcmOptions: { imageUrl: msg.imageUrl } }
          : undefined,
        data: msg.data ?? {},
      });
    } catch (err) {
      logger.error({ err }, '[push] FCM send failed');
    }
  },
};
