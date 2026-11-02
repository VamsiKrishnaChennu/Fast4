import path from 'node:path';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { connectWithRetry, disconnectDb, isDbConnected } from './config/db.js';
import { EnvError, loadEnv, loadEnvFile } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createDictionaryService } from './services/dictionaryService.js';
import { createRoomManager } from './services/roomManager.js';
import { createRoomPersistence } from './services/roomPersistence.js';
import { createTokenService } from './services/tokenService.js';
import { createRealtime } from './sockets/realtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(here, '..', '.env'));

let env;
try {
  env = loadEnv();
} catch (err) {
  if (err instanceof EnvError) {
    process.stderr.write(`${err.message}\nSet it in server/.env (see docs/ENV.md).\n`);
    process.exit(1);
  }
  throw err;
}

const logger = createLogger(env);
const clientDist = path.join(here, '..', '..', 'client', 'dist');

async function main() {
  await connectWithRetry({ uri: env.MONGODB_URI, isProduction: env.isProduction, logger });
  const dictionary = createDictionaryService();
  await dictionary.init();
  logger.info({ words: dictionary.counts() }, 'dictionary loaded');

  const persistence = createRoomPersistence({ logger });
  const abandoned = await persistence.abandonOpenRooms();
  if (abandoned > 0) logger.info({ abandoned }, 'rooms from the last run marked abandoned');
  const roomManager = createRoomManager({
    onChange: (snapshot) => persistence.save(snapshot),
    onClose: (code) => persistence.close(code),
  });

  const app = createApp({
    env,
    logger,
    readinessChecks: [
      { name: 'database', check: isDbConnected },
      { name: 'dictionary', check: () => dictionary.isReady() },
    ],
    dictionary,
    roomManager,
    clientDist: existsSync(clientDist) ? clientDist : undefined,
  });
  const server = http.createServer(app);
  const realtime = createRealtime({
    httpServer: server,
    env,
    logger,
    tokenService: createTokenService(env),
    roomManager,
  });
  const sweeper = setInterval(() => {
    roomManager.sweepIdle();
    persistence.purgeExpired();
  }, 60_000);
  sweeper.unref();
  server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'server listening'));

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    clearInterval(sweeper);
    realtime.shutdown().finally(() => {
      server.close(async () => {
        await disconnectDb();
        process.exit(0);
      });
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
