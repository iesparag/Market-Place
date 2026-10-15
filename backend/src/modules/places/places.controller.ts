import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../common/apiResponse.js';
import { placesService } from './places.service.js';

const AutocompleteQuery = z.object({
  input: z.string().min(3),
  sessiontoken: z.string().optional(),
});
const DetailsQuery = z.object({
  place_id: z.string().min(1),
  sessiontoken: z.string().optional(),
});

export const placesController = {
  async autocomplete(req: Request, res: Response) {
    const { input, sessiontoken } = AutocompleteQuery.parse(req.query);
    ok(res, await placesService.autocomplete(input, sessiontoken));
  },

  async details(req: Request, res: Response) {
    const { place_id, sessiontoken } = DetailsQuery.parse(req.query);
    ok(res, await placesService.details(place_id, sessiontoken));
  },
};
