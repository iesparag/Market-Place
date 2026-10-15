import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { toOptimizedWebp } from '../../common/image.js';

export const UPLOAD_DIR = 'uploads';
mkdirSync(UPLOAD_DIR, { recursive: true });

// Cloudinary is used when all 3 keys are present; otherwise we save to local /uploads.
const cloudinaryOn = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
if (cloudinaryOn) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

// Keep the file in memory so we can either stream it to Cloudinary or write it to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype)),
});

function uploadToCloudinary(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'marketplace', resource_type: 'image' },
      (err, result) => (err || !result ? reject(err ?? new Error('Cloudinary upload failed')) : resolve(result.secure_url)),
    );
    stream.end(buffer);
  });
}

export const mediaRoutes = Router();

/** Upload a single product image. Returns a public URL (Cloudinary CDN or local). */
mediaRoutes.post(
  '/upload',
  authenticate,
  authorize('product:create'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('NO_FILE', 'No image uploaded');
    if (!req.file.buffer?.length) throw AppError.badRequest('EMPTY_FILE', 'Uploaded file is empty');

    // Every upload is resized + re-encoded to WebP here — one place, every entity type
    // (store logo/banner, product images, category icons, promo banners) gets it for free
    // since they all funnel through this one endpoint. Falls back to the original buffer
    // on a decode failure (e.g. a corrupt file multer's mimetype sniff let through) rather
    // than failing the whole upload on an optimization step.
    let buffer = req.file.buffer;
    try {
      buffer = await toOptimizedWebp(req.file.buffer);
    } catch (err) {
      logger.warn({ err }, 'WebP optimization failed — storing original image unoptimized');
    }
    const optimized = buffer !== req.file.buffer;

    if (cloudinaryOn) {
      try {
        const url = await uploadToCloudinary(buffer);
        return ok(res, { url, provider: 'cloudinary', optimized, bytes: buffer.byteLength });
      } catch (err) {
        // Surface the real reason (bad keys, quota, etc.) instead of an opaque 500.
        throw AppError.badRequest('UPLOAD_FAILED', `Cloudinary upload failed: ${(err as Error)?.message ?? 'unknown error'}`);
      }
    }

    // Local fallback: write to /uploads and serve via PUBLIC_URL.
    // NOTE: on Railway/most hosts the disk is EPHEMERAL — files vanish on redeploy. Use Cloudinary in prod.
    try {
      const filename = `${randomUUID()}${optimized ? '.webp' : extname(req.file.originalname).toLowerCase()}`;
      writeFileSync(`${UPLOAD_DIR}/${filename}`, buffer);
      return ok(res, { url: `${env.PUBLIC_URL}/${UPLOAD_DIR}/${filename}`, provider: 'local', optimized, bytes: buffer.byteLength });
    } catch (err) {
      throw AppError.badRequest('UPLOAD_FAILED', `Local save failed: ${(err as Error)?.message ?? 'unknown error'}`);
    }
  }),
);
