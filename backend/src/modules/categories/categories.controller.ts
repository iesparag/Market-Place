import type { Request, Response } from 'express';
import { ok, created } from '../../common/apiResponse.js';
import { categoriesService } from './categories.service.js';

export const categoriesController = {
  async list(_req: Request, res: Response) {
    ok(res, await categoriesService.list());
  },
  async create(req: Request, res: Response) {
    created(res, await categoriesService.create(req.body));
  },
  async update(req: Request, res: Response) {
    ok(res, await categoriesService.update(req.params.id!, req.body));
  },
};
