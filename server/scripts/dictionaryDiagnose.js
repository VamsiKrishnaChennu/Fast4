/* Read-only check of the dictionary: file sizes, database counts, key words, and the SSA download.
   Usage: npm run dictionary:diagnose */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { dictionaryKey, normalizeAnswer } from '@fastfour/shared';
import { connectWithRetry } from '../src/config/db.js';
import { loadEnv, loadEnvFile } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { DictionaryEntry } from '../src/models/DictionaryEntry.js';
import { fetchSsaNames } from './lib/sources.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'data', 'dictionary');
const FILES = {
  name: 'names.txt',
  place: 'places.txt',
  animal: 'animals.txt',
  thing: 'things.txt',
};
const WORDS = {
  name: ['tulasi'],
  place: ['tamil nadu', 'tamilnadu'],
  animal: ['tiger', 'kite'],
  thing: ['tape', 'kite'],
};
const out = (text) => process.stdout.write(`${text}\n`);

const inFiles = {};
for (const [category, file] of Object.entries(FILES)) {
  const lines = (await readFile(path.join(dir, file), 'utf8')).split('\n').filter(Boolean);
  inFiles[category] = new Set(lines.map((l) => dictionaryKey(normalizeAnswer(l))));
  out(`${file}: ${lines.length} lines`);
}

loadEnvFile(path.join(here, '..', '.env'));
const env = loadEnv();
try {
  await connectWithRetry({
    uri: env.MONGODB_URI,
    isProduction: env.isProduction,
    logger: createLogger(env),
  });
  out(`\nDatabase: ${mongoose.connection.host}/${mongoose.connection.name}`);
  const counts = await DictionaryEntry.aggregate([
    { $group: { _id: { category: '$category', source: '$source' }, n: { $sum: 1 } } },
  ]);
  for (const c of counts.sort((a, b) =>
    (a._id.category + a._id.source).localeCompare(b._id.category + b._id.source),
  )) {
    out(`  ${c._id.category} / ${c._id.source}: ${c.n}`);
  }
  for (const [category, words] of Object.entries(WORDS)) {
    for (const word of words) {
      const stored = await DictionaryEntry.exists({ category, word });
      out(
        `  ${category} "${word}": file ${inFiles[category].has(dictionaryKey(word)) ? 'yes' : 'NO'}, database ${stored ? 'yes' : 'NO'}`,
      );
    }
  }
} catch (err) {
  out(`Database check failed: ${err.message}`);
} finally {
  await mongoose.disconnect();
}

out('\nSSA download:');
try {
  const names = await fetchSsaNames({ downloadsDir: path.join(dir, 'downloads'), log: out });
  out(`  ok, ${names.length} names with 50+ births`);
} catch (err) {
  out(`  FAILED: ${err.message}`);
}
