import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { Role } from '@app/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import type { AuthUser } from '../../common/types.js';
import { Product } from '../products/product.model.js';
import { Order } from '../orders/order.model.js';
import { User } from '../auth/user.model.js';

const answerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    role: { type: String, enum: ['buyer', 'vendor', 'admin'], default: 'buyer' },
    text: { type: String, required: true },
  },
  { _id: true, timestamps: true },
);

const questionSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: String,
    text: { type: String, required: true },
    answers: { type: [answerSchema], default: [] },
  },
  { timestamps: true },
);
export type ProductQuestionDoc = InferSchemaType<typeof questionSchema>;
export const ProductQuestion = model('ProductQuestion', questionSchema);

type AnswerRole = 'buyer' | 'vendor' | 'admin';

/** Who may answer / moderate this product's Q&A → the role to badge the answer with (null = not allowed). */
async function answerRole(
  user: AuthUser,
  product: { _id: unknown; storeId: unknown; allowBuyerReplies?: boolean },
): Promise<AnswerRole | null> {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN) return 'admin';
  if ((user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF) && String(user.storeId) === String(product.storeId)) return 'vendor';
  if (product.allowBuyerReplies !== false) {
    const purchased = await Order.exists({
      customerId: user.id,
      status: { $in: ['paid', 'fulfilled'] },
      'items.productId': String(product._id),
    });
    if (purchased) return 'buyer';
  }
  return null;
}
/** Admin or the owning vendor may delete/moderate. */
function canModerate(user: AuthUser, product: { storeId: unknown }): boolean {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN) return true;
  return (user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF) && String(user.storeId) === String(product.storeId);
}

export const faqRoutes = Router();

// Public: questions + answers for a product, plus its Q&A settings.
faqRoutes.get('/product/:productId', asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId).select('faqEnabled allowBuyerReplies').lean();
  const questions = await ProductQuestion.find({ productId: req.params.productId }).sort({ createdAt: -1 }).lean();
  ok(res, {
    faqEnabled: product?.faqEnabled !== false,
    allowBuyerReplies: product?.allowBuyerReplies !== false,
    questions,
  });
}));

// Whether the signed-in user may answer questions here (buyer+allowed / vendor / admin).
faqRoutes.get('/product/:productId/can-answer', authenticate, asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId).select('storeId allowBuyerReplies').lean();
  if (!product) throw AppError.notFound('Product not found');
  ok(res, { role: await answerRole(req.user!, product) });
}));

// Ask a question (any signed-in user, if FAQ is enabled).
faqRoutes.post('/product/:productId/question', authenticate, asyncHandler(async (req, res) => {
  const text = z.string().min(3).max(500).parse(req.body.text);
  const product = await Product.findById(req.params.productId).select('storeId faqEnabled').lean();
  if (!product) throw AppError.notFound('Product not found');
  if (product.faqEnabled === false) throw AppError.badRequest('FAQ_OFF', 'Q&A is disabled for this product');
  const user = await User.findById(req.user!.id).select('name').lean();
  const doc = await ProductQuestion.create({
    productId: req.params.productId, storeId: product.storeId,
    userId: req.user!.id, userName: user?.name, text, answers: [],
  });
  created(res, doc);
}));

// Answer a question (buyer if allowed + purchased, or vendor/admin).
faqRoutes.post('/question/:qid/answer', authenticate, asyncHandler(async (req, res) => {
  const text = z.string().min(1).max(1000).parse(req.body.text);
  const q = await ProductQuestion.findById(req.params.qid);
  if (!q) throw AppError.notFound('Question not found');
  const product = await Product.findById(q.productId).select('storeId allowBuyerReplies').lean();
  if (!product) throw AppError.notFound('Product not found');
  const role = await answerRole(req.user!, product);
  if (!role) throw AppError.forbidden('You are not allowed to answer this question');
  const user = await User.findById(req.user!.id).select('name').lean();
  q.answers.push({ userId: req.user!.id, userName: user?.name, role, text } as never);
  await q.save();
  created(res, q);
}));

// Delete a whole question (admin / owning vendor).
faqRoutes.delete('/question/:qid', authenticate, asyncHandler(async (req, res) => {
  const q = await ProductQuestion.findById(req.params.qid);
  if (!q) throw AppError.notFound('Question not found');
  const product = await Product.findById(q.productId).select('storeId').lean();
  if (!product || !canModerate(req.user!, product)) throw AppError.forbidden('Not allowed');
  await q.deleteOne();
  ok(res, { deleted: true });
}));

// Delete a single answer (admin / owning vendor) — remove an inappropriate reply.
faqRoutes.delete('/question/:qid/answer/:aid', authenticate, asyncHandler(async (req, res) => {
  const q = await ProductQuestion.findById(req.params.qid);
  if (!q) throw AppError.notFound('Question not found');
  const product = await Product.findById(q.productId).select('storeId').lean();
  if (!product || !canModerate(req.user!, product)) throw AppError.forbidden('Not allowed');
  q.answers = q.answers.filter((a) => String((a as { _id: unknown })._id) !== req.params.aid) as never;
  await q.save();
  ok(res, { deleted: true });
}));

// Moderation list: vendor → their store's questions; admin → all.
faqRoutes.get('/', authenticate, asyncHandler(async (req, res) => {
  const user = req.user!;
  const scoped = user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF;
  const filter = scoped ? { storeId: user.storeId } : {};
  const questions = await ProductQuestion.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const products = await Product.find({ _id: { $in: questions.map((q) => q.productId) } }).select('title').lean();
  const titleMap = new Map(products.map((p) => [String(p._id), p.title]));
  ok(res, questions.map((q) => ({ ...q, productTitle: titleMap.get(String(q.productId)) ?? '—' })));
}));
