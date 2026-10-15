import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../common/apiResponse.js';
import { routingService } from './routing.service.js';

const RouteQuery = z.object({
  fromLat: z.coerce.number(),
  fromLng: z.coerce.number(),
  toLat: z.coerce.number(),
  toLng: z.coerce.number(),
});

export const routingController = {
  async route(req: Request, res: Response) {
    const { fromLat, fromLng, toLat, toLng } = RouteQuery.parse(req.query);
    ok(res, await routingService.route({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }));
  },
};
