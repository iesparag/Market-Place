import type { Request, Response } from 'express';
import { z } from 'zod';
import { NAV_META, WILDCARD_PERMISSION, Role, PERMISSIONS } from '@app/shared';
import { ok } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { User } from '../auth/user.model.js';
import { DEFAULT_ROLE_PERMISSIONS, effectivePermissions } from '../roles/rolePermissions.js';
import { writeAudit } from '../audit/audit.module.js';

export const usersController = {
  /** GET /me — current user + effective permissions. */
  async me(req: Request, res: Response) {
    const auth = req.user;
    if (!auth) throw AppError.unauthenticated();
    const doc = await User.findById(auth.id).lean();
    if (!doc) throw AppError.notFound('User not found');
    ok(res, {
      id: auth.id,
      name: doc.name,
      email: doc.email,
      phone: doc.phone,
      emailVerified: doc.emailVerified ?? false,
      role: auth.role,
      storeId: auth.storeId,
      permissions: auth.permissions,
    });
  },

  /** Update own profile (name / phone). */
  async updateMe(req: Request, res: Response) {
    const input = z.object({ name: z.string().min(1).optional(), phone: z.string().optional() }).parse(req.body);
    const doc = await User.findByIdAndUpdate(req.user!.id, input, { new: true }).select('name email phone emailVerified').lean();
    if (!doc) throw AppError.notFound('User not found');
    ok(res, doc);
  },

  /** GET /me/navigation — sidebar filtered to the user's effective permissions. */
  async navigation(req: Request, res: Response) {
    const perms = req.user?.permissions ?? [];
    const hasAll = perms.includes(WILDCARD_PERMISSION);
    const hasStore = Boolean(req.user?.storeId);
    const nav = NAV_META.map((section) => ({
      section: section.section,
      items: section.items.filter(
        (it) => (hasAll || perms.includes(it.perm)) && (!it.requiresStore || hasStore),
      ),
    })).filter((section) => section.items.length > 0);
    ok(res, nav);
  },

  /** Admin: list users. */
  async list(req: Request, res: Response) {
    const role = req.query.role as string | undefined;
    const users = await User.find(role ? { role } : {})
      .select('name email role storeId status createdAt')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    ok(res, users);
  },

  /** Admin: change a user's role. */
  async setRole(req: Request, res: Response) {
    const role = z.nativeEnum(Role).parse(req.body.role);
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true })
      .select('name email role status')
      .lean();
    if (!user) throw AppError.notFound('User not found');
    writeAudit(req.user?.id, 'user:role', { targetType: 'user', targetId: req.params.id, meta: { role } });
    ok(res, user);
  },

  /** Admin: get a user's effective permissions + the full permission catalog. */
  async getPermissions(req: Request, res: Response) {
    const user = await User.findById(req.params.id).lean();
    if (!user) throw AppError.notFound('User not found');
    ok(res, {
      role: user.role,
      wildcard: (DEFAULT_ROLE_PERMISSIONS[user.role] ?? []).includes(WILDCARD_PERMISSION),
      effective: effectivePermissions(user.role, user.customPermissions ?? undefined),
      all: PERMISSIONS,
    });
  },

  /**
   * Admin: set a user's permissions to a desired list. We diff against the role's
   * defaults and store the difference as customPermissions {add, remove}.
   * (Takes effect on the user's next login — permissions are baked into the JWT.)
   */
  async setPermissions(req: Request, res: Response) {
    const desired = z.array(z.string()).parse(req.body.permissions);
    const user = await User.findById(req.params.id);
    if (!user) throw AppError.notFound('User not found');
    const base = new Set(DEFAULT_ROLE_PERMISSIONS[user.role] ?? []);
    const want = new Set(desired);
    const add = [...want].filter((p) => !base.has(p));
    const remove = [...base].filter((p) => !want.has(p));
    user.customPermissions = { add, remove };
    await user.save();
    writeAudit(req.user?.id, 'user:permissions', { targetType: 'user', targetId: req.params.id, meta: { add, remove } });
    ok(res, { add, remove, effective: effectivePermissions(user.role, { add, remove }) });
  },
};
