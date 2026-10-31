/* Loads server/data/dictionary/*.txt into MongoDB. Safe to run again. Usage: npm run dictionary:seed */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectWithRetry } from '../src/config/db.js';
import { loadEnv, loadEnvFile } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { seedDictionary } from '../src/services/dictionarySeeder.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(here, '..', '.env'));
const env = loadEnv();
const logger = createLogger(env);

try {
  await connectWithRetry({ uri: env.MONGODB_URI, isProduction: env.isProduction, logger });
  const report = await seedDictionary(path.join(here, '..', 'data', 'dictionary'));
  for (const [category, { read, added }] of Object.entries(report)) {
    process.stdout.write(`${category}: ${read} words read, ${added} new\n`);
  }
} finally {
  await mongoose.disconnect();
}
