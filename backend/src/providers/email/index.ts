import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}
export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465, // 465 = SSL, 587 = STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

/**
 * Real SMTP (e.g. Gmail) when configured, otherwise logs to the console (dev).
 * Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=you@gmail.com, SMTP_PASS=<app password>.
 */
export const emailProvider: EmailProvider = {
  async send(msg) {
    if (!smtpConfigured) {
      logger.info({ to: msg.to, subject: msg.subject }, '[email] (console) would send — set SMTP_* to deliver');
      return;
    }
    try {
      await getTransporter().sendMail({
        from: env.MAIL_FROM ?? env.SMTP_USER,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      });
    } catch (err) {
      logger.error({ err, to: msg.to }, '[email] send failed');
    }
  },
};
