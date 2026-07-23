import bcrypt from 'bcryptjs';
import { Role } from '@app/shared';
import { connectDb, disconnectDb } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { User } from '../../modules/auth/user.model.js';

/** Idempotent: create the user only if the email doesn't already exist. */
async function upsertUser(email: string, name: string, role: string) {
  const existing = await User.findOne({ email });
  if (existing) {
    logger.info(`${role} already exists: ${email}`);
    return existing;
  }
  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash('password123', 10),
    role,
  });
  logger.info(`Seeded ${role}: ${email} / password123`);
  return user;
}

/**
 * Minimal seed — only the super admin.
 * Everything else (vendors, categories, products, banners) is created through the app.
 */
async function seed(): Promise<void> {
  await connectDb();
  await upsertUser('admin@marketplace.local', 'Super Admin', Role.SUPER_ADMIN);
  logger.info('Seed complete');
  await disconnectDb();
}

void seed();
