import { pino } from 'pino';
import { env, isProd } from './env.js';

export const logger = pino({
  level: isProd ? 'info' : 'debug',
  transport: isProd
    ? undefined
    : { target: 'pino/file', options: { destination: 1 } },
  base: { env: env.NODE_ENV },
});
