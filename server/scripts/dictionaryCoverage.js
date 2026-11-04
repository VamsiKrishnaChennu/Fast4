/* Checks how many realistic player answers the committed word lists accept.
   Usage: npm run dictionary:coverage
   Reads the four .txt files and tests/fixtures/dictionary-coverage.json. No database, no network.
   Manual script, not part of CI. Target: at least 95% hits per list, and every listed must-have word. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dictionaryKey, lookupCandidates, normalizeAnswer } from '@fastfour/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'data', 'dictionary');
const FILES = {
  name: 'names.txt',
  place: 'places.txt',
  animal: 'animals.txt',
  thing: 'things.txt',
};
const fixture = JSON.parse(
  await readFile(path.join(here, '..', 'tests', 'fixtures', 'dictionary-coverage.json'), 'utf8'),
);
const out = (text) => process.stdout.write(`${text}\n`);

let allHits = 0;
let allTotal = 0;
let failed = false;
for (const [category, file] of Object.entries(FILES)) {
  const keys = new Set(
    (await readFile(path.join(dir, file), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((w) => dictionaryKey(normalizeAnswer(w))),
  );
  const answers = [...new Set(fixture[category])];
  const misses = answers.filter((raw) => {
    const normalized = normalizeAnswer(raw);
    return !lookupCandidates(normalized, category).some((c) => keys.has(dictionaryKey(c)));
  });
  const hits = answers.length - misses.length;
  const percent = (100 * hits) / answers.length;
  allHits += hits;
  allTotal += answers.length;
  if (percent < 95) failed = true;
  out(`${category}: ${hits}/${answers.length} hits (${percent.toFixed(1)}%)`);
  if (misses.length) out(`  misses: ${misses.join(', ')}`);
}
out(`all: ${allHits}/${allTotal} (${((100 * allHits) / allTotal).toFixed(1)}%)`);
if (failed) {
  out('Below the 95% target.');
  process.exitCode = 1;
}
