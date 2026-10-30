import { loadEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { createApp } from '../../src/app.js';

export const validEnvSource = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/npatarena',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

export function createTestApp(overrides = {}) {
  const { envSource = {}, ...options } = overrides;
  const env = loadEnv({ ...validEnvSource, ...envSource });
  return createApp({ env, logger: createLogger(env), ...options });
}
