import { z } from 'zod';
import { RoleEnum } from '../enums/index.js';

export const RegisterSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const MeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: RoleEnum,
  storeId: z.string().optional(),
  permissions: z.array(z.string()),
});
export type Me = z.infer<typeof MeSchema>;
