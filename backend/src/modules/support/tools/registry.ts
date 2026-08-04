import { z } from 'zod';
import { AppError } from '../../../common/AppError.js';
import type { AuthUser } from '../../../common/types.js';
import type { ToolSpec } from '../../../providers/ai/types.js';
import { Order } from '../../orders/order.model.js';
import { ordersService } from '../../orders/orders.service.js';
import { searchProducts } from '../rag.service.js';
import type { SupportConfigDoc } from '../support.model.js';

/**
 * ── THE ANTI-FRAUD BOUNDARY ──────────────────────────────────────────────────
 * Every capability the support bot can exercise lives here, and every one of these rules is
 * enforced *in code*, not by asking the model nicely:
 *
 *  1. IDENTITY comes from the JWT (`ctx.user.id`), NEVER from tool args. The model may pass any
 *     orderId; a tool only ever reads/acts on rows where `customerId === ctx.user.id`.
 *  2. OWNERSHIP is re-checked on every single access. A non-owned / missing id returns the same
 *     ORDER_NOT_FOUND — no existence oracle, no data leak.
 *  3. FEATURE FLAGS (SupportConfig.selfService) gate both *exposure* to the model and *execution*
 *     (defence in depth) — an admin turning a capability off actually removes it.
 *  4. MUTATIONS delegate to the trusted, already-guarded service (ordersService.cancel), so the
 *     bot has EXACTLY the customer's own capability — never more, never a second code path.
 *  5. NO TOOL MOVES MONEY. Refunds/exceptions have no tool at all → only `escalate_to_support`.
 *  6. ARGS are Zod-validated before use (prompt-injected junk can't reach a query).
 */

export interface ToolContext {
  user: AuthUser;
  config: SupportConfigDoc;
}
export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** This tool wants a human (e.g. a paid order can't be self-cancelled). */
  escalate?: boolean;
  /** Audit action name when the tool mutated state. */
  action?: string;
}
interface SupportTool {
  spec: ToolSpec;
  /** Feature flag that must be on for this tool to exist/run (undefined = always on). */
  flag?: (c: SupportConfigDoc) => boolean;
  schema: z.ZodTypeAny;
  run(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>;
}

const money = (minor?: number | null) => (typeof minor === 'number' ? `₹${(minor / 100).toFixed(2)}` : '—');

/** Loose shape over a lean Order (Mongoose lean types are noisy/nullable). */
type LeanOrder = {
  _id: unknown;
  orderNumber?: string;
  status?: string;
  amounts?: {
    itemsTotal?: number | null;
    discount?: number | null;
    tax?: number | null;
    delivery?: number | null;
    grandTotal?: number | null;
  } | null;
  items?: { title?: string | null; qty?: number | null; productId?: unknown; variantSku?: string | null }[];
  createdAt?: Date;
};

/** Human-friendly, non-leaky order summary. */
function orderView(o: LeanOrder) {
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    total: money(o.amounts?.grandTotal),
    items: (o.items ?? []).map((i) => ({ title: i.title, qty: i.qty })),
    placedAt: o.createdAt,
  };
}

/** Load an order that MUST belong to the caller. Returns null on missing OR not-owned (same). */
async function ownedOrder(ctx: ToolContext, orderId: string): Promise<LeanOrder | null> {
  if (!/^[a-f0-9]{24}$/i.test(orderId)) return null; // reject non-ObjectId before hitting Mongo
  return (await Order.findOne({ _id: orderId, customerId: ctx.user.id }).lean()) as unknown as LeanOrder | null;
}

const OrderIdArg = z.object({ orderId: z.string() });

// ── tools ────────────────────────────────────────────────────────────────────
const getMyOrders: SupportTool = {
  spec: {
    name: 'get_my_orders',
    description: "List the customer's own recent orders (id, number, status, total).",
    parameters: { type: 'object', properties: { limit: { type: 'number' } } },
  },
  schema: z.object({ limit: z.coerce.number().int().min(1).max(20).optional() }),
  async run(ctx, args) {
    const { limit } = this.schema.parse(args) as { limit?: number };
    const orders = await Order.find({ customerId: ctx.user.id })
      .sort({ createdAt: -1 })
      .limit(limit ?? 10)
      .lean();
    return { ok: true, data: (orders as unknown as LeanOrder[]).map(orderView) };
  },
};

const getOrder: SupportTool = {
  spec: {
    name: 'get_order',
    description: "Get one of the customer's own orders by id. Returns ORDER_NOT_FOUND if it isn't theirs.",
    parameters: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
  },
  schema: OrderIdArg,
  async run(ctx, args) {
    const { orderId } = OrderIdArg.parse(args);
    const o = await ownedOrder(ctx, orderId);
    if (!o) return { ok: false, error: 'ORDER_NOT_FOUND' };
    return { ok: true, data: orderView(o) };
  },
};

const STATUS_STEPS: Record<string, string> = {
  pending: 'Order placed, awaiting payment.',
  paid: 'Payment received — being prepared for dispatch.',
  fulfilled: 'Delivered / fulfilled.',
  cancelled: 'Cancelled.',
  refunded: 'Refunded.',
};
const trackOrder: SupportTool = {
  spec: {
    name: 'track_order',
    description: "Get the delivery status of the customer's own order.",
    parameters: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
  },
  flag: (c) => c.selfService?.trackOrder !== false,
  schema: OrderIdArg,
  async run(ctx, args) {
    const { orderId } = OrderIdArg.parse(args);
    const o = await ownedOrder(ctx, orderId);
    if (!o) return { ok: false, error: 'ORDER_NOT_FOUND' };
    return { ok: true, data: { orderNumber: o.orderNumber, status: o.status, note: STATUS_STEPS[o.status ?? ''] ?? '' } };
  },
};

const getInvoice: SupportTool = {
  spec: {
    name: 'get_invoice',
    description: "Get the amount breakdown (invoice) for the customer's own order.",
    parameters: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
  },
  flag: (c) => c.selfService?.viewInvoice !== false,
  schema: OrderIdArg,
  async run(ctx, args) {
    const { orderId } = OrderIdArg.parse(args);
    const o = await ownedOrder(ctx, orderId);
    if (!o) return { ok: false, error: 'ORDER_NOT_FOUND' };
    return {
      ok: true,
      data: {
        orderNumber: o.orderNumber,
        items: money(o.amounts?.itemsTotal),
        discount: money(o.amounts?.discount),
        tax: money(o.amounts?.tax),
        delivery: money(o.amounts?.delivery),
        total: money(o.amounts?.grandTotal),
      },
    };
  },
};

const reorder: SupportTool = {
  spec: {
    name: 'reorder',
    description: "Return the items from one of the customer's past orders so they can add them to their cart again. Does NOT place an order.",
    parameters: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
  },
  flag: (c) => c.selfService?.reorder !== false,
  schema: OrderIdArg,
  async run(ctx, args) {
    const { orderId } = OrderIdArg.parse(args);
    const o = await ownedOrder(ctx, orderId);
    if (!o) return { ok: false, error: 'ORDER_NOT_FOUND' };
    // Read-only: hand back a cart payload for the client to rebuild. No money moves here.
    return {
      ok: true,
      data: {
        cart: (o.items ?? []).map((i) => ({ productId: String(i.productId), variantSku: i.variantSku, qty: i.qty })),
      },
    };
  },
};

const cancelOrder: SupportTool = {
  spec: {
    name: 'cancel_order',
    description:
      "Cancel one of the customer's own orders IF it is still cancellable (unpaid/unshipped). " +
      'If it cannot be self-cancelled, this escalates to a human — do not promise a cancellation yourself.',
    parameters: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
  },
  flag: (c) => c.selfService?.cancelUnshipped !== false,
  schema: OrderIdArg,
  async run(ctx, args) {
    const { orderId } = OrderIdArg.parse(args);
    // Ownership pre-check (mask non-owned as not-found; never escalate someone else's id).
    const o = await ownedOrder(ctx, orderId);
    if (!o) return { ok: false, error: 'ORDER_NOT_FOUND' };
    try {
      // Delegate to the SAME guarded service the customer's own UI uses (ownership + state +
      // restock + idempotency all enforced there). The bot gets exactly the customer's power.
      await ordersService.cancel(orderId, String(ctx.user.id));
      return { ok: true, data: { status: 'cancelled' }, action: 'support:self_cancel' };
    } catch (err) {
      // A state failure (e.g. already paid) is a legitimate "needs a human" — escalate.
      // A 403/404 means it isn't cancellable-by-them; mask and do not escalate on a bad id.
      const status = err instanceof AppError ? err.status : 500;
      if (status === 403 || status === 404) return { ok: false, error: 'ORDER_NOT_FOUND' };
      return { ok: false, error: err instanceof AppError ? err.code : 'CANCEL_FAILED', escalate: true };
    }
  },
};

const ProductQueryArg = z.object({ query: z.string().min(1).max(200) });
const searchProductsTool: SupportTool = {
  spec: {
    name: 'search_products',
    description:
      'Search the catalog for products by keywords/description to answer a product question. ' +
      'Returns matching product titles + slugs (share the slug so the customer can open the product page).',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  schema: ProductQueryArg,
  async run(_ctx, args) {
    const { query } = ProductQueryArg.parse(args);
    const hits = await searchProducts(query, { limit: 5 });
    // Public catalog info only — title + slug, nothing customer-specific.
    return { ok: true, data: hits.map((h) => ({ title: h.title, slug: h.slug })) };
  },
};

const escalate: SupportTool = {
  spec: {
    name: 'escalate_to_support',
    description:
      'Hand the conversation to a human. Use for refunds, post-shipment cancellations, ' +
      'discounts, complaints, or anything you are not certain you can safely do yourself.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string' }, summary: { type: 'string' } },
      required: ['reason'],
    },
  },
  schema: z.object({ reason: z.string().max(500), summary: z.string().max(500).optional() }),
  async run(_ctx, args) {
    const { reason, summary } = this.schema.parse(args) as { reason: string; summary?: string };
    return { ok: true, escalate: true, data: { reason, summary } };
  },
};

const ALL_TOOLS: SupportTool[] = [getMyOrders, getOrder, trackOrder, getInvoice, reorder, cancelOrder, searchProductsTool, escalate];

/** Tools currently enabled by the admin's feature flags — this is what the model is even shown. */
export function toolSpecs(config: SupportConfigDoc): ToolSpec[] {
  return ALL_TOOLS.filter((t) => !t.flag || t.flag(config)).map((t) => t.spec);
}

/**
 * Execute a tool by name. Unknown name or a disabled feature → a safe rejection (never throws
 * to the caller). Args are Zod-validated inside each tool. This is the ONLY way the bot touches data.
 */
export async function runTool(name: string, ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = ALL_TOOLS.find((t) => t.spec.name === name);
  if (!tool) return { ok: false, error: 'UNKNOWN_TOOL' };
  if (tool.flag && !tool.flag(ctx.config)) return { ok: false, error: 'FEATURE_DISABLED', escalate: true };
  try {
    return await tool.run(ctx, args ?? {});
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: 'BAD_ARGS' };
    return { ok: false, error: 'TOOL_ERROR' };
  }
}
