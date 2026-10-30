import path from 'node:path';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { connectWithRetry, disconnectDb, isDbConnected } from './config/db.js';
import { EnvError, loadEnv, loadEnvFile } from './config/env.js';
import { createLogger } from './config/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(here, '..', '.env'));

let env;
try {
  env = loadEnv();
} catch (err) {
  if (err instanceof EnvError) {
    process.stderr.write(`${err.message}\nSee server/.env.example.\n`);
    process.exit(1);
  }
  throw err;
}

const logger = createLogger(env);
const clientDist = path.join(here, '..', '..', 'client', 'dist');

async function main() {
  await connectWithRetry({ uri: env.MONGODB_URI, isProduction: env.isProduction, logger });

  const app = createApp({
    env,
    logger,
    readinessChecks: [{ name: 'database', check: isDbConnected }],
    clientDist: existsSync(clientDist) ? clientDist : undefined,
  });
  const server = http.createServer(app);
  server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'server listening'));

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
  };
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => shutdown(signal));
}

for (const event of ['unhandledRejection', 'uncaughtException']) {
  process.on(event, (err) => {
    logger.fatal({ err }, event);
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'startup failed');
  process.exit(1);
});
