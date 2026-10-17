import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../common/apiResponse.js';
import { catalogService } from './catalog.service.js';
import { homeService } from '../home/home.module.js';

/** Both-or-neither — a stray lat with no lng (or vice versa) is a client bug, not a
 * valid "no location" state, so it's rejected rather than silently ignored. */
const GeoQuery = z
  .object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() })
  .refine((v) => (v.lat == null) === (v.lng == null), { message: 'lat and lng must be given together' });

export const catalogController = {
  async home(req: Request, res: Response) {
    const geo = GeoQuery.parse(req.query);
    ok(res, await homeService.getHome(geo.lat != null ? { lat: geo.lat, lng: geo.lng! } : undefined));
  },
  async listProducts(req: Request, res: Response) {
    ok(
      res,
      await catalogService.listProducts({
        q: req.query.q as string | undefined,
        category: req.query.category as string | undefined,
        ids: typeof req.query.products === 'string'
          ? req.query.products.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
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
  async getProductSlugById(req: Request, res: Response) {
    ok(res, await catalogService.getProductSlugById(req.params.id!));
  },
  async relatedProducts(req: Request, res: Response) {
    ok(res, await catalogService.relatedProducts(req.params.id!));
  },
  async listCategories(_req: Request, res: Response) {
    ok(res, await catalogService.listCategories());
  },
  async categoryTree(_req: Request, res: Response) {
    ok(res, await catalogService.categoryTree());
  },
  async listStores(req: Request, res: Response) {
    const geo = GeoQuery.parse(req.query);
    ok(res, await catalogService.listStores(geo.lat != null ? { lat: geo.lat, lng: geo.lng! } : {}));
  },
  async getStore(req: Request, res: Response) {
    ok(res, await catalogService.getStoreBySlug(req.params.slug!));
  },
  /** "Now" tab — stores open right now within instant-delivery range. Requires lat/lng
   * (there's no meaningful "Now" without a location to be near). */
  async listNowStores(req: Request, res: Response) {
    const geo = GeoQuery.parse(req.query);
    ok(res, geo.lat != null ? await catalogService.listNowStores({ lat: geo.lat, lng: geo.lng! }) : []);
  },
};
