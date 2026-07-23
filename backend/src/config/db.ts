import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI);
  logger.info('MongoDB connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
