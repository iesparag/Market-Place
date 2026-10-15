import sharp from 'sharp';
import { env } from '../config/env.js';

/**
 * Resize (bounded to MEDIA_MAX_DIMENSION_PX on the long side, never upscales) and
 * re-encode any uploaded image to WebP, stepping quality down from
 * MEDIA_WEBP_QUALITY_START toward MEDIA_WEBP_QUALITY_MIN until the result is under
 * MEDIA_WEBP_MAX_BYTES. The byte cap is a target, not a hard wall — a very detailed
 * image at the quality floor is still returned rather than failing the upload; a tiny
 * hard-coded KB ceiling (e.g. 1-2KB) would make every real product photo unusably
 * blurry, so this trades a *soft* ceiling for actually-presentable images.
 */
export async function toOptimizedWebp(buffer: Buffer): Promise<Buffer> {
  const resized = sharp(buffer).rotate().resize({
    width: env.MEDIA_MAX_DIMENSION_PX,
    height: env.MEDIA_MAX_DIMENSION_PX,
    fit: 'inside',
    withoutEnlargement: true,
  });

  let quality = env.MEDIA_WEBP_QUALITY_START;
  let out = await resized.clone().webp({ quality }).toBuffer();

  while (out.byteLength > env.MEDIA_WEBP_MAX_BYTES && quality > env.MEDIA_WEBP_QUALITY_MIN) {
    quality -= 10;
    out = await resized.clone().webp({ quality: Math.max(quality, env.MEDIA_WEBP_QUALITY_MIN) }).toBuffer();
  }

  return out;
}
