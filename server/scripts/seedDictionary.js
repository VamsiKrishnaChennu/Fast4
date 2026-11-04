/* Loads server/data/dictionary/*.txt into MongoDB. Safe to run again.
   Usage: npm run dictionary:seed             adds new words only
          npm run dictionary:seed -- --replace  also deletes old "seed" words that are no longer in the files
   Words added by appeals (source "external") are never deleted. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectWithRetry } from '../src/config/db.js';
import { loadEnv, loadEnvFile } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { seedDictionary } from '../src/services/dictionarySeeder.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const replace = process.argv.includes('--replace');
loadEnvFile(path.join(here, '..', '.env'));
const env = loadEnv();
const logger = createLogger(env);
const out = (text) => process.stdout.write(`${text}\n`);

try {
  await connectWithRetry({ uri: env.MONGODB_URI, isProduction: env.isProduction, logger });
  out(`Database: ${mongoose.connection.host}/${mongoose.connection.name}`);
  const report = await seedDictionary(path.join(here, '..', 'data', 'dictionary'), { replace });
  for (const [category, { read, added, removed, total }] of Object.entries(report)) {
    const gone = replace ? `, ${removed} removed` : '';
    out(`${category}: ${read} words read, ${added} new${gone}, ${total} in the database now`);
  }
  out('Restart the server: it loads the dictionary only when it starts.');
} finally {
  await mongoose.disconnect();
}
