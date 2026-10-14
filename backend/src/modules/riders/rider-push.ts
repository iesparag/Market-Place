import { Schema, model, type InferSchemaType } from 'mongoose';
import { pushProvider } from '../../providers/push/index.js';

/** FCM device tokens for riders — separate from notifications.module.ts's `DeviceToken`
 *  (that one's keyed on `userId`, and a rider is not a `User`). Riders have no in-app
 *  bell/notification feed — push is the only channel, so this is deliberately simpler
 *  than the User notification system (no persisted Notification doc, no read/unread). */
const riderDeviceTokenSchema = new Schema(
  {
    riderId: { type: Schema.Types.ObjectId, ref: 'Rider', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, default: 'android' },
  },
  { timestamps: true },
);
export const RiderDeviceToken = model('RiderDeviceToken', riderDeviceTokenSchema);

/** Push a message to every device a rider is registered on. Fire-and-forget by callers. */
export async function notifyRider(
  riderId: string,
  data: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  const tokens = (await RiderDeviceToken.find({ riderId }).select('token').lean()).map((t) => t.token);
  if (!tokens.length) return;
  await pushProvider.send({ tokens, title: data.title, body: data.body, data: data.data });
}
