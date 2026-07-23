import type { Request, Response } from 'express';
import { ok, created } from '../../common/apiResponse.js';
import { authService } from './auth.service.js';

export const authController = {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body);
    created(res, result);
  },
  async registerVendor(req: Request, res: Response) {
    const result = await authService.registerVendor(req.body);
    created(res, result);
  },
  async login(req: Request, res: Response) {
    const result = await authService.login(req.body);
    ok(res, result);
  },
  async refresh(req: Request, res: Response) {
    ok(res, await authService.refresh(req.body.refreshToken));
  },
  async changePassword(req: Request, res: Response) {
    ok(res, await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword));
  },
  async sendOtp(req: Request, res: Response) {
    ok(res, await authService.sendOtp(req.user!.id));
  },
  async verifyOtp(req: Request, res: Response) {
    ok(res, await authService.verifyOtp(req.user!.id, req.body.code));
  },
  async forgotPassword(req: Request, res: Response) {
    ok(res, await authService.forgotPassword(req.body.email));
  },
  async resetPassword(req: Request, res: Response) {
    ok(res, await authService.resetPassword(req.body.email, req.body.code, req.body.newPassword));
  },
};
