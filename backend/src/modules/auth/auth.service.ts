import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role, type LoginInput, type RegisterInput } from '@app/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../common/AppError.js';
import type { AuthUser } from '../../common/types.js';
import { User } from './user.model.js';
import { effectivePermissions } from '../roles/rolePermissions.js';
import { storesService } from '../stores/stores.service.js';
import { emailProvider } from '../../providers/email/index.js';

function signAccess(user: AuthUser): string {
  return jwt.sign(user, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}

/** Long-lived refresh token — carries only the user id; access rights are re-derived on refresh. */
function signRefresh(userId: string): string {
  return jwt.sign({ id: userId }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL });
}

function toAuthUser(doc: {
  _id: unknown;
  role: string;
  storeId?: unknown;
  customPermissions?: { add?: string[]; remove?: string[] } | null;
}): AuthUser {
  return {
    id: String(doc._id),
    role: doc.role as Role,
    storeId: doc.storeId ? String(doc.storeId) : undefined,
    permissions: effectivePermissions(doc.role, doc.customPermissions ?? undefined),
  };
}

export const authService = {
  async register(input: RegisterInput) {
    const exists = await User.findOne({ email: input.email }).lean();
    if (exists) throw AppError.conflict('Email already registered');
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await User.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: Role.CUSTOMER,
    });
    const auth = toAuthUser(user);
    return { token: signAccess(auth), refreshToken: signRefresh(auth.id), user: { ...auth, name: user.name, email: user.email } };
  },

  async registerVendor(
    input: RegisterInput & {
      storeName: string; vendorType?: string; gstin?: string; pan?: string;
      contactPhone?: string; contactEmail?: string;
      address?: { line1?: string; city?: string; state?: string; pincode?: string };
    },
  ) {
    const exists = await User.findOne({ email: input.email }).lean();
    if (exists) throw AppError.conflict('Email already registered');
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await User.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: Role.VENDOR,
    });
    const store = await storesService.create(String(user._id), {
      name: input.storeName,
      vendorType: input.vendorType,
      gstin: input.gstin,
      pan: input.pan,
      contactPhone: input.contactPhone ?? input.phone,
      contactEmail: input.contactEmail ?? input.email,
      address: input.address,
    });
    user.storeId = store._id;
    await user.save();
    // Welcome / application-received email (no-op if SMTP unset — provider logs instead).
    await emailProvider.send({
      to: user.email,
      subject: `Application received — ${store.name}`,
      html: `
        <h2>Application received 🎉</h2>
        <p>Hi ${input.name}, your store <b>${store.name}</b> has been created and is <b>pending approval</b>.</p>
        <p>Our team will review it shortly. Once approved, sign in to the seller dashboard to add products and manage orders.</p>
        <p><b>Your login</b><br/>Email: <b>${user.email}</b><br/>Password: <b>${input.password}</b></p>
        <p><a href="${env.ADMIN_ORIGIN}/login">Open seller dashboard →</a></p>
        <p style="color:#888;font-size:12px">Keep this email safe. You can change your password after signing in.</p>
      `,
    });
    const auth = toAuthUser(user);
    return { token: signAccess(auth), refreshToken: signRefresh(auth.id), user: { ...auth, name: user.name, email: user.email }, store };
  },

  async login(input: LoginInput) {
    const user = await User.findOne({ email: input.email });
    if (!user) throw AppError.unauthenticated('Invalid credentials');
    const match = await bcrypt.compare(input.password, user.passwordHash);
    if (!match) throw AppError.unauthenticated('Invalid credentials');
    // Self-heal: older vendor accounts may predate the user→store link. If a vendor
    // owns a store but has no storeId, backfill it so "My Store" (nav gated on storeId) shows.
    if (!user.storeId && user.role === Role.VENDOR) {
      const store = await storesService.myStore(String(user._id));
      if (store?._id) { user.set('storeId', store._id); await user.save(); }
    }
    const auth = toAuthUser(user);
    return { token: signAccess(auth), refreshToken: signRefresh(auth.id), user: { ...auth, name: user.name, email: user.email } };
  },

  /** Exchange a valid refresh token for a fresh access token (rotates the refresh token too). */
  async refresh(refreshToken: string) {
    let payload: { id: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { id: string };
    } catch {
      throw AppError.unauthenticated('Invalid or expired refresh token');
    }
    const user = await User.findById(payload.id);
    if (!user) throw AppError.unauthenticated('User no longer exists');
    const auth = toAuthUser(user);
    return {
      token: signAccess(auth),
      refreshToken: signRefresh(auth.id),
      user: { ...auth, name: user.name, email: user.email },
    };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) throw AppError.badRequest('WRONG_PASSWORD', 'Current password is incorrect');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    return { changed: true };
  },

  /** Generate a 6-digit OTP, store it (10 min), and "email" it (console provider in dev). */
  async sendOtp(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    if (user.emailVerified) return { sent: false, alreadyVerified: true };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    user.otpCode = code;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    await emailProvider.send({
      to: user.email,
      subject: 'Verify your email',
      html: `<p>Your verification code is <b>${code}</b> (valid 10 minutes).</p>`,
    });
    return { sent: true };
  },

  /** Forgot password: email a 6-digit reset code (15 min). Never reveals if the email exists. */
  async forgotPassword(email: string) {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      user.resetCode = code;
      user.resetExpires = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      await emailProvider.send({
        to: user.email,
        subject: 'Reset your password',
        html: `<p>Your password reset code is <b>${code}</b> (valid 15 minutes). Ignore if you didn't request this.</p>`,
      });
    }
    return { sent: true };
  },

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.resetCode || !user.resetExpires || user.resetExpires < new Date() || user.resetCode !== code)
      throw AppError.badRequest('RESET_INVALID', 'Invalid or expired reset code');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetCode = undefined;
    user.resetExpires = undefined;
    await user.save();
    return { reset: true };
  },

  async verifyOtp(userId: string, code: string) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    if (user.emailVerified) return { verified: true };
    if (!user.otpCode || !user.otpExpires || user.otpExpires < new Date())
      throw AppError.badRequest('OTP_EXPIRED', 'Code expired — request a new one');
    if (user.otpCode !== code) throw AppError.badRequest('OTP_INVALID', 'Incorrect code');
    user.emailVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();
    return { verified: true };
  },
};
