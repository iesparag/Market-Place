/**
 * Third-party logistics provider abstraction — for orders outside our own rider-covered
 * cities. Same shape as providers/payment: swap the gateway without touching the
 * delivery module. See docs/05-PAYMENTS.md for the sibling pattern this mirrors.
 */

export type LogisticsProviderName = 'mock';

export interface DispatchInput {
  taskId: string;
  orderNumber: string;
  pickup: { line1?: string | null; city?: string | null; lat?: number | null; lng?: number | null };
  drop: { line1?: string | null; city?: string | null; pincode?: string | null; lat?: number | null; lng?: number | null };
  items: { title?: string | null; qty: number }[];
}

export interface DispatchResult {
  externalTaskId: string;
  trackingUrl?: string;
}

/** A verified inbound status callback. `id` is what we dedupe on. */
export interface LogisticsWebhookEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface LogisticsProvider {
  readonly name: LogisticsProviderName;
  dispatch(input: DispatchInput): Promise<DispatchResult>;
  cancel(externalTaskId: string): Promise<void>;
  /** Verify + parse a webhook from its RAW body. Throws if the signature is bad. */
  verifyWebhook(rawBody: Buffer | string, headers: Record<string, string | undefined>): LogisticsWebhookEvent;
}

export class LogisticsProviderError extends Error {
  constructor(
    public readonly providerCode: string,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = 'LogisticsProviderError';
  }
}
