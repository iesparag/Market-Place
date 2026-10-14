import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../common/apiResponse.js';
import { geocodingService } from './geocoding.service.js';

const SearchQuery = z.object({ q: z.string().min(3) });
const ReverseQuery = z.object({ lat: z.coerce.number(), lng: z.coerce.number() });

export const geocodingController = {
  async search(req: Request, res: Response) {
    const { q } = SearchQuery.parse(req.query);
    ok(res, await geocodingService.search(q));
  },

  async reverse(req: Request, res: Response) {
    const { lat, lng } = ReverseQuery.parse(req.query);
    ok(res, await geocodingService.reverse(lat, lng));
  },
};
