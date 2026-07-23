import { z } from 'zod';

export const ObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'invalid id');
export const MoneySchema = z.number().int().nonnegative(); // minor units (paise)
export const SlugSchema = z.string().min(1).regex(/^[a-z0-9-]+$/);
