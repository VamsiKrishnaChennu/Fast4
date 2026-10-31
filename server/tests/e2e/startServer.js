/* Starts the real server for end-to-end tests: an in-memory (or TEST_MONGODB_URI) database,
   the built client, and a memory email outbox exposed at /__e2e/outbox. Test-only; never deployed. */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { isDbConnected } from '../../src/config/db.js';
import { createMemoryEmailProvider } from '../../src/services/emailService.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const port = Number(process.env.E2E_PORT ?? 4100);

let uri;
if (process.env.TEST_MONGODB_URI) {
  uri = `${process.env.TEST_MONGODB_URI.replace(/\/$/, '')}/e2e_${Date.now()}`;
} else {
  const memory = await MongoMemoryServer.create();
  uri = `${memory.getUri()}e2e`;
}
mongoose.set('sanitizeFilter', true);
await mongoose.connect(uri);

const env = loadEnv({
  NODE_ENV: 'test',
  MONGODB_URI: uri,
  JWT_ACCESS_SECRET: 'e2e-access-secret-e2e-access-secret-1',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-e2e-refresh-secret-2',
  SUPPORT_EMAIL: 'support@example.com',
  APP_VERSION: 'e2e',
  CLIENT_ORIGIN: `http://localhost:${port}`,
});
const emailProvider = createMemoryEmailProvider();
const app = createApp({
  env,
  logger: createLogger(env),
  readinessChecks: [{ name: 'database', check: isDbConnected }],
  clientDist: path.join(root, 'client', 'dist'),
  emailProvider,
  authLimit: { limit: 1000 },
  apiLimit: { limit: 10000 },
});

const outer = express();
outer.get('/__e2e/outbox', (req, res) => res.json(emailProvider.outbox));
outer.use(app);
http.createServer(outer).listen(port);
