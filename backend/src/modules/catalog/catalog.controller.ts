import type { Request, Response } from 'express';
import { ok } from '../../common/apiResponse.js';
import { catalogService } from './catalog.service.js';

export const catalogController = {
  async listProducts(req: Request, res: Response) {
    ok(
      res,
      await catalogService.listProducts({
        q: req.query.q as string | undefined,
        category: req.query.category as string | undefined,
        priceMin: req.query.priceMin ? Number(req.query.priceMin) : undefined,
        priceMax: req.query.priceMax ? Number(req.query.priceMax) : undefined,
        ratingMin: req.query.ratingMin ? Number(req.query.ratingMin) : undefined,
        veg: req.query.veg === 'true' || req.query.veg === '1',
        sort: req.query.sort as string | undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 12,
      }),
    );
  },
  async getProduct(req: Request, res: Response) {
    ok(res, await catalogService.getProductBySlug(req.params.slug!));
  },
  async listCategories(_req: Request, res: Response) {
    ok(res, await catalogService.listCategories());
  },
  async categoryTree(_req: Request, res: Response) {
    ok(res, await catalogService.categoryTree());
  },
  async listStores(_req: Request, res: Response) {
    ok(res, await catalogService.listStores());
  },
  async getStore(req: Request, res: Response) {
    ok(res, await catalogService.getStoreBySlug(req.params.slug!));
  },
};
