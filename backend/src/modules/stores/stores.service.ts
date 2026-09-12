import { AppError } from '../../common/AppError.js';
import { env } from '../../config/env.js';
import { Store } from './store.model.js';
import { User } from '../auth/user.model.js';
import { emailProvider } from '../../providers/email/index.js';
import { Product } from '../products/product.model.js';
import { Order } from '../orders/order.model.js';
import { ProductEmbedding } from '../support/kb.model.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const storesService = {
  async list(filter: { status?: string } = {}) {
    return Store.find(filter).sort({ createdAt: -1 }).lean();
  },

  async getById(id: string) {
    const store = await Store.findById(id).lean();
    if (!store) throw AppError.notFound('Store not found');
    return store;
  },

  async getBySlug(slug: string) {
    const store = await Store.findOne({ slug }).lean();
    if (!store) throw AppError.notFound('Store not found');
    return store;
  },

  async myStore(ownerId: string) {
    return Store.findOne({ ownerId }).lean();
  },

  async create(
    ownerId: string,
    input: {
      name: string; vendorType?: string; description?: string;
      legalName?: string; gstin?: string; pan?: string;
      contactEmail?: string; contactPhone?: string;
      address?: { line1?: string; city?: string; state?: string; pincode?: string };
    },
  ) {
    const existing = await Store.findOne({ ownerId });
    if (existing) throw AppError.conflict('You already own a store');
    let slug = slugify(input.name);
    if (await Store.findOne({ slug })) slug = `${slug}-${Date.now().toString(36)}`;
    return Store.create({
      ownerId,
      name: input.name,
      slug,
      vendorType: input.vendorType ?? 'generic',
      description: input.description ?? '',
      legalName: input.legalName,
      gstin: input.gstin,
      pan: input.pan,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      address: input.address,
      status: 'pending',
    });
  },

  /** Owner (own store) or admin edits the storefront/business profile. Never changes status/slug/owner. */
  async updateProfile(actor: { id: string; role: string }, id: string, fields: Record<string, unknown>) {
    const store = await Store.findById(id);
    if (!store) throw AppError.notFound('Store not found');
    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin';
    if (!isAdmin && String(store.ownerId) !== actor.id) throw AppError.forbidden('Not your store');
    const editable = [
      'name', 'description', 'vendorType', 'logo', 'banner', 'coverImages',
      'legalName', 'gstin', 'pan', 'establishedYear', 'contactEmail', 'contactPhone',
      'website', 'address', 'social',
    ] as const;
    for (const k of editable) if (k in fields) store.set(k, (fields as Record<string, unknown>)[k]);

    // Payout details are handled apart from the rest: changing where money goes
    // always drops the verified flag, so an admin has to look at it again.
    if ('bankAccount' in fields) {
      const next = (fields.bankAccount ?? {}) as Record<string, unknown>;
      const current = (store.bankAccount ?? {}) as Record<string, unknown>;
      const changed = (['accountName', 'accountNumber', 'ifsc', 'upiId'] as const).some(
        (k) => (next[k] ?? '') !== (current[k] ?? ''),
      );
      store.set('bankAccount', {
        accountName: next.accountName ?? '',
        accountNumber: next.accountNumber ?? '',
        ifsc: next.ifsc ?? '',
        upiId: next.upiId ?? '',
        verified: changed ? false : ((current.verified as boolean | undefined) ?? false),
      });
    }

    await store.save();
    return store;
  },

  /** Admin-only: mark the payout account checked against the KYC docs. */
  async setBankVerified(id: string, verified: boolean) {
    const store = await Store.findByIdAndUpdate(id, { 'bankAccount.verified': verified }, { new: true });
    if (!store) throw AppError.notFound('Store not found');
    return store;
  },

  async setStatus(id: string, status: 'approved' | 'rejected' | 'suspended') {
    const store = await Store.findByIdAndUpdate(id, { status }, { new: true });
    if (!store) throw AppError.notFound('Store not found');
    await this.notifyOwnerStatus(store.ownerId, store.name, status);
    return store;
  },

  /**
   * Hard delete — irreversible, and only for a store that has never taken an order.
   *
   * Categories are a shared platform taxonomy (no `storeId` on the Category model — see
   * docs/03-DATA-MODEL.md), so deleting a store must never touch them: other vendors' products
   * reference the same categories. Only this store's own products are removed.
   *
   * A store with any order history is refused outright: its orders/ledger/payout rows carry
   * `storeId` references that must survive for financial/audit integrity (CLAUDE.md rule #6).
   * `suspend` (via `setStatus`) is the correct action for a store that has ever transacted —
   * it already hides the store and its products everywhere (see `catalog.service.ts`).
   */
  async remove(id: string) {
    const store = await Store.findById(id);
    if (!store) throw AppError.notFound('Store not found');

    const hasOrders = await Order.exists({ storeIds: id });
    if (hasOrders)
      throw AppError.badRequest(
        'STORE_HAS_ORDERS',
        'This store has order history and cannot be deleted. Suspend it instead.',
      );

    const productIds = await Product.find({ storeId: id }).distinct('_id');
    await ProductEmbedding.deleteMany({ storeId: id });
    await Product.deleteMany({ storeId: id });
    await Store.deleteOne({ _id: id });

    return { deleted: true, storeId: id, productsDeleted: productIds.length };
  },

  /** Email the store owner when their store is approved / rejected / suspended (no-op if SMTP unset). */
  async notifyOwnerStatus(ownerId: unknown, storeName: string, status: 'approved' | 'rejected' | 'suspended') {
    const owner = await User.findById(ownerId).select('name email').lean();
    if (!owner?.email) return;
    const dash = `${env.ADMIN_ORIGIN}/login`;
    const templates = {
      approved: {
        subject: `Your store is approved — ${storeName} ✅`,
        html: `<h2>You're approved! ✅</h2>
          <p>Hi ${owner.name ?? 'there'}, great news — <b>${storeName}</b> has been approved.</p>
          <p>Sign in to the seller dashboard to complete your store profile (logo, banner, business details) and start adding products.</p>
          <p><a href="${dash}">Go to seller dashboard →</a></p>`,
      },
      rejected: {
        subject: `Update on your store application — ${storeName}`,
        html: `<h2>Application update</h2>
          <p>Hi ${owner.name ?? 'there'}, unfortunately <b>${storeName}</b> was not approved at this time.</p>
          <p>Please reply to this email or contact support if you'd like more details.</p>`,
      },
      suspended: {
        subject: `Your store has been suspended — ${storeName}`,
        html: `<h2>Store suspended</h2>
          <p>Hi ${owner.name ?? 'there'}, <b>${storeName}</b> has been temporarily suspended.</p>
          <p>Please contact support to resolve this.</p>`,
      },
    } as const;
    await emailProvider.send({ to: owner.email, ...templates[status] });
  },
};
