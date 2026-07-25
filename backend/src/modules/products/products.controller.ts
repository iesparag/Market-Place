import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../common/apiResponse.js';
import { productsService } from './products.service.js';

export const productsController = {
  async list(req: Request, res: Response) {
    const { page, limit, q, category } = req.query;
    ok(res, await productsService.list(req.storeId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q: typeof q === 'string' ? q : undefined,
      categoryId: typeof category === 'string' && category ? category : undefined,
    }));
  },
  async create(req: Request, res: Response) {
    created(res, await productsService.create(req.storeId!, req.body));
  },
  async update(req: Request, res: Response) {
    ok(res, await productsService.update(req.storeId, req.params.id!, req.body));
  },
  async getOne(req: Request, res: Response) {
    ok(res, await productsService.getOne(req.storeId, req.params.id!));
  },
  async remove(req: Request, res: Response) {
    ok(res, await productsService.remove(req.storeId, req.params.id!));
  },
  async setPublished(req: Request, res: Response) {
    const active = z.boolean().parse(req.body.active);
    ok(res, await productsService.setPublished(req.storeId, req.params.id!, active));
  },
  async adjustStock(req: Request, res: Response) {
    const { variantSku, stock } = z
      .object({ variantSku: z.string(), stock: z.number().int().min(0) })
      .parse(req.body);
    ok(res, await productsService.adjustStock(req.storeId, req.params.id!, variantSku, stock));
  },
  async lowStock(req: Request, res: Response) {
    ok(res, await productsService.lowStock(req.storeId!));
  },
};
