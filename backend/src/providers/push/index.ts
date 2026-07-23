import admin from 'firebase-admin';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
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
        notification: { title: msg.title, body: msg.body },
        data: msg.data ?? {},
      });
    } catch (err) {
      logger.error({ err }, '[push] FCM send failed');
    }
  },
};
