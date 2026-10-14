import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';

const GRAPH_VERSION = 'v21.0';

const templateSchema = new Schema(
  {
    name: { type: String, required: true, unique: true }, // Meta template name — a-z 0-9 _ only
    language: { type: String, default: 'en_US' },
    category: { type: String, enum: ['MARKETING', 'UTILITY'], default: 'MARKETING' },
    bodyText: { type: String, required: true }, // "Hi {{1}}, your cart has {{2}} item(s) waiting — use {{3}} for 10% off!"
    variableCount: { type: Number, default: 0 },
    hasImageHeader: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'pending', 'approved', 'rejected'], default: 'draft' },
    metaTemplateId: { type: String },
    rejectionReason: { type: String },
  },
  { timestamps: true },
);
export type WhatsAppTemplateDoc = InferSchemaType<typeof templateSchema>;
export const WhatsAppTemplate = model('WhatsAppTemplate', templateSchema);

export const whatsappRoutes = Router();
whatsappRoutes.use(authenticate, authorize('notification:manage'));

whatsappRoutes.get('/configured', asyncHandler(async (_req, res) => {
  ok(res, {
    configured: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    templatesManageable: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_BUSINESS_ACCOUNT_ID),
  });
}));

whatsappRoutes.get('/templates', asyncHandler(async (_req, res) => {
  ok(res, await WhatsAppTemplate.find().sort({ createdAt: -1 }).lean());
}));

const CreateTemplateSchema = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers and underscores only'),
  language: z.string().default('en_US'),
  category: z.enum(['MARKETING', 'UTILITY']).default('MARKETING'),
  bodyText: z.string().min(1).max(1024),
  hasImageHeader: z.boolean().default(false),
});

/**
 * Create a template. With WHATSAPP_BUSINESS_ACCOUNT_ID configured this also submits it
 * to Meta for review (status → 'pending', usually approved within minutes to a few
 * hours) — every business-initiated WhatsApp message MUST use an approved template,
 * there's no way around that at the platform level. Without it, saved as 'draft' only
 * (lets you design templates before Meta access is set up).
 */
whatsappRoutes.post('/templates', asyncHandler(async (req, res) => {
  const input = CreateTemplateSchema.parse(req.body);
  const variableCount = (input.bodyText.match(/\{\{\d+\}\}/g) ?? []).length;

  let status: 'draft' | 'pending' = 'draft';
  let metaTemplateId: string | undefined;

  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    const components: Record<string, unknown>[] = [{ type: 'BODY', text: input.bodyText }];
    if (input.hasImageHeader) components.unshift({ type: 'HEADER', format: 'IMAGE' });

    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name, language: input.language, category: input.category, components }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await metaRes.json()) as { id?: string; error?: { message?: string } };
    if (!metaRes.ok) {
      logger.error({ json }, '[whatsapp] template create failed');
      throw AppError.badRequest('TEMPLATE_CREATE_FAILED', json?.error?.message ?? 'Meta rejected the template');
    }
    metaTemplateId = json.id;
    status = 'pending';
  }

  const doc = await WhatsAppTemplate.create({ ...input, variableCount, status, metaTemplateId });
  created(res, doc);
}));

/** Pull the latest approval status from Meta for every template still pending review. */
whatsappRoutes.post('/templates/sync', asyncHandler(async (_req, res) => {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    ok(res, { synced: 0 });
    return;
  }
  const pending = await WhatsAppTemplate.find({ status: 'pending', metaTemplateId: { $exists: true } });
  let synced = 0;
  for (const t of pending) {
    try {
      const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${t.metaTemplateId}?fields=status,rejected_reason`, {
        headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await r.json()) as { status?: string; rejected_reason?: string };
      const metaStatus = (json.status ?? '').toLowerCase();
      if (metaStatus === 'approved' || metaStatus === 'rejected') {
        t.status = metaStatus as 'approved' | 'rejected';
        t.rejectionReason = json.rejected_reason;
        await t.save();
        synced += 1;
      }
    } catch (err) {
      logger.error({ err, id: t.metaTemplateId }, '[whatsapp] template status sync failed');
    }
  }
  ok(res, { synced });
}));

whatsappRoutes.delete('/templates/:id', asyncHandler(async (req, res) => {
  await WhatsAppTemplate.findByIdAndDelete(req.params.id);
  ok(res, { deleted: true });
}));
