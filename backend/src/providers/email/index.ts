import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}
export interface EmailProvider {
  readonly name: 'resend' | 'smtp' | 'console';
  send(msg: EmailMessage): Promise<void>;
}

/**
 * Nothing here may hang: `send` is on the request path for OTP / password-reset, and a
 * blocked SMTP port makes a TCP connect sit there until the OS gives up (~2 min), which
 * the mobile client sees as a plain 20s timeout with no clue why.
 */
const SEND_TIMEOUT_MS = 8_000;

const from = env.MAIL_FROM ?? env.SMTP_USER ?? 'onboarding@resend.dev';

// ── Resend (HTTPS) ──────────────────────────────────────────────────────────
// Preferred on PaaS hosts: Railway/Render/Fly block outbound SMTP by default, but
// port 443 is always open. No SDK — `fetch` is enough, same as the Razorpay provider.
async function sendViaResend(msg: EmailMessage): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

// ── SMTP (Gmail & friends) ──────────────────────────────────────────────────
let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  const port = env.SMTP_PORT ?? 587;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL, 587 = STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    // Without these, a firewalled port stalls the whole HTTP request.
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });
  return transporter;
}

async function sendViaSmtp(msg: EmailMessage): Promise<void> {
  await getTransporter().sendMail({ from, to: msg.to, subject: msg.subject, html: msg.html });
}

function pickTransport(): EmailProvider['name'] {
  if (env.RESEND_API_KEY) return 'resend';
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) return 'smtp';
  return 'console';
}

const transport = pickTransport();
if (transport === 'console')
  logger.warn('[email] no RESEND_API_KEY / SMTP_* — emails will only be logged, not delivered');
else logger.info({ transport }, '[email] transport ready');

/**
 * Delivery is best-effort and bounded: it never throws and never blocks longer than
 * `SEND_TIMEOUT_MS`. Callers that need to know whether the mail landed should read the
 * logs — the OTP flows deliberately answer the client without waiting for the gateway.
 */
export const emailProvider: EmailProvider = {
  name: transport,
  async send(msg) {
    if (transport === 'console') {
      logger.info({ to: msg.to, subject: msg.subject }, '[email] (console) would send');
      return;
    }
    const started = Date.now();
    try {
      const deliver = transport === 'resend' ? sendViaResend(msg) : sendViaSmtp(msg);
      await withTimeout(deliver, SEND_TIMEOUT_MS);
      logger.info({ to: msg.to, subject: msg.subject, transport, ms: Date.now() - started }, '[email] sent');
    } catch (err) {
      // The most common cause in production is a host that blocks SMTP egress — say so,
      // because "ETIMEDOUT" on its own sends people hunting for the wrong bug.
      logger.error(
        { err, to: msg.to, transport, ms: Date.now() - started },
        transport === 'smtp'
          ? '[email] SMTP send failed — if this is a timeout, the host is likely blocking ports 25/465/587; use RESEND_API_KEY instead'
          : '[email] send failed',
      );
    }
  },
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`email send timed out after ${ms}ms`)), ms).unref(),
    ),
  ]);
}
