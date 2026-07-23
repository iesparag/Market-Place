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

    if (cloudinaryOn) {
      const url = await uploadToCloudinary(req.file.buffer);
      return ok(res, { url, provider: 'cloudinary' });
    }

    // Local fallback (dev): write to /uploads and serve via PUBLIC_URL.
    const filename = `${randomUUID()}${extname(req.file.originalname).toLowerCase()}`;
    writeFileSync(`${UPLOAD_DIR}/${filename}`, req.file.buffer);
    return ok(res, { url: `${env.PUBLIC_URL}/${UPLOAD_DIR}/${filename}`, provider: 'local' });
  }),
);
