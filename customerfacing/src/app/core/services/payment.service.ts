import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

/** One selectable way to pay, as configured by the admin. */
export interface PaymentMethodOption {
  id: 'razorpay' | 'cod';
  label: string;
  description: string;
  enabled: boolean;
  maxOrderValue?: number;
}

export interface PaymentMethodsResponse {
  provider: 'razorpay' | 'mock';
  live: boolean;
  publicKey: string;
  currency: string;
  methods: PaymentMethodOption[];
}

export interface CheckoutSession {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  method: 'razorpay' | 'cod' | 'mock';
  provider: string;
  publicKey: string;
  providerOrderId: string | null;
  amount: number;
  currency: string;
  brandName: string;
  brandLogo: string;
  prefill: { name: string; email: string; contact: string };
  requiresGateway: boolean;
}

export interface PaymentStatus {
  orderId: string;
  orderStatus: string;
  paymentStatus: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  method: string | null;
  amount: number;
  paidAt: string | null;
  refundedAmount: number;
  lastFailure: string | null;
  providerOrderId: string | null;
}

/** How a pay attempt ended — the caller decides what to show. */
export type PayResult =
  | { outcome: 'paid'; status: PaymentStatus }
  | { outcome: 'cod'; status: PaymentStatus }
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; message: string };

const RAZORPAY_SDK = 'https://checkout.razorpay.com/v1/checkout.js';

/** Minimal shape of the Razorpay checkout global we actually use. */
interface RazorpayHandlerResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (e: { error?: { description?: string; reason?: string } }) => void): void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly api = inject(ApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private sdkPromise: Promise<boolean> | null = null;

  /** Cached so the checkout page and the order page agree on what's on offer. */
  readonly methods = signal<PaymentMethodsResponse | null>(null);

  async loadMethods(): Promise<PaymentMethodsResponse> {
    const cached = this.methods();
    if (cached) return cached;
    const res = await firstValueFrom(this.api.get<PaymentMethodsResponse>('/payments/methods'));
    this.methods.set(res);
    return res;
  }

  /**
   * Pay for an order, end to end: create the gateway order, open the sheet, verify.
   * Resolves with what actually happened — it never throws for a user cancellation,
   * because "changed my mind" is not an error.
   */
  async pay(orderId: string, method: 'razorpay' | 'cod'): Promise<PayResult> {
    let session: CheckoutSession;
    try {
      session = await firstValueFrom(
        this.api.post<CheckoutSession>('/payments/checkout', { orderId, method }),
      );
    } catch (e) {
      return { outcome: 'failed', message: messageOf(e, 'Could not start the payment') };
    }

    // COD is settled on delivery — nothing to open.
    if (!session.requiresGateway) {
      return { outcome: 'cod', status: await this.status(orderId) };
    }

    // Dev gateway (no Razorpay keys configured): confirm straight through.
    if (session.provider === 'mock') {
      try {
        const status = await firstValueFrom(
          this.api.post<PaymentStatus>('/payments/mock-pay', { providerOrderId: session.providerOrderId }),
        );
        return { outcome: 'paid', status };
      } catch (e) {
        return { outcome: 'failed', message: messageOf(e, 'Test payment failed') };
      }
    }

    if (!this.isBrowser) return { outcome: 'failed', message: 'Payments are only available in the browser' };
    if (!(await this.loadSdk()))
      return { outcome: 'failed', message: 'Could not reach the payment gateway. Check your connection.' };

    return this.openSheet(session, orderId);
  }

  /** Wraps Razorpay's callback API in a promise so the caller can just `await` it. */
  private openSheet(session: CheckoutSession, orderId: string): Promise<PayResult> {
    return new Promise<PayResult>((resolve) => {
      const Razorpay = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (!Razorpay) return resolve({ outcome: 'failed', message: 'Payment gateway unavailable' });

      let settled = false;
      const finish = (result: PayResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const rzp = new Razorpay({
        key: session.publicKey,
        amount: session.amount,
        currency: session.currency,
        name: session.brandName,
        image: session.brandLogo || undefined,
        description: `Order ${session.orderNumber}`,
        order_id: session.providerOrderId,
        prefill: session.prefill,
        notes: { orderId },
        theme: { color: '#EA580C' },
        // Fires when the customer closes the sheet without paying.
        modal: { ondismiss: () => finish({ outcome: 'cancelled' }) },
        handler: (response: RazorpayHandlerResponse) => {
          void firstValueFrom(
            this.api.post<PaymentStatus>('/payments/confirm', {
              providerOrderId: response.razorpay_order_id,
              providerPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          )
            .then((status) => finish({ outcome: 'paid', status }))
            .catch(async (e) => {
              // The sheet said success but our verification didn't land. The webhook is
              // the backstop, so re-read our own status before calling it a failure.
              const status = await this.status(orderId).catch(() => null);
              if (status?.paymentStatus === 'paid') return finish({ outcome: 'paid', status });
              finish({
                outcome: 'failed',
                message: messageOf(e, 'We could not confirm your payment. If money was debited it will be confirmed shortly.'),
              });
            });
        },
      });

      rzp.on('payment.failed', (e) =>
        finish({ outcome: 'failed', message: e.error?.description ?? 'Payment failed. Please try another method.' }),
      );
      rzp.open();
    });
  }

  status(orderId: string): Promise<PaymentStatus> {
    return firstValueFrom(this.api.get<PaymentStatus>(`/payments/order/${orderId}`));
  }

  /**
   * Poll until an async method (UPI collect) settles. Used after a "processing"
   * outcome so the order page flips to paid without the customer refreshing.
   */
  async waitForSettlement(orderId: string, timeoutMs = 60_000): Promise<PaymentStatus | null> {
    if (!this.isBrowser) return null;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await sleep(3000);
      const status = await this.status(orderId).catch(() => null);
      if (status && status.paymentStatus !== 'pending' && status.paymentStatus !== 'unpaid') return status;
    }
    return null;
  }

  /** Inject the gateway script once, lazily — never during SSR. */
  private loadSdk(): Promise<boolean> {
    if (!this.isBrowser) return Promise.resolve(false);
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve(true);
    this.sdkPromise ??= new Promise<boolean>((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SDK}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(true));
        existing.addEventListener('error', () => resolve(false));
        return;
      }
      const script = document.createElement('script');
      script.src = RAZORPAY_SDK;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        this.sdkPromise = null; // let a retry try again
        resolve(false);
      };
      document.head.appendChild(script);
    });
    return this.sdkPromise;
  }
}

function messageOf(e: unknown, fallback: string): string {
  return (e as { message?: string })?.message ?? fallback;
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
