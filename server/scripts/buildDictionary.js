/* Builds server/data/dictionary/{names,places,animals,things}.txt.
   Run on a machine with internet access: npm run dictionary:build
   Every online source is optional; the script reports what it used and falls back to the curated lists. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Filter } from 'bad-words';
import { normalizeAnswer } from '@fastfour/shared';
import { parseBlocklist } from './lib/blocklist.js';
import { descendants, lemmasOf, loadWordnet } from './lib/wordnet.js';
import { fetchNltkNames, fetchSsaNames, fetchWikidataPlaces } from './lib/sources.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'data', 'dictionary');
const require = createRequire(import.meta.url);
const profanity = new Filter();
const log = (message) => process.stdout.write(`${message}\n`);

/** Reads a curated list: new lines or commas separate entries, lines starting with # are notes. */
async function starter(file) {
  const text = await readFile(path.join(OUT, 'starter', file), 'utf8');
  return text
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .flatMap((line) => line.split(','))
    .map((x) => x.trim())
    .filter(Boolean);
}

async function attempt(label, fn) {
  try {
    const result = await fn();
    log(`  ${label}: ${result.length} entries`);
    return result;
  } catch (err) {
    log(`  ${label}: not available (${err.message})`);
    return [];
  }
}

function clean(words) {
  const out = new Set();
  for (const word of words) {
    const normalized = normalizeAnswer(word);
    if (normalized.length < 2 || normalized.length > 30) continue;
    if (profanity.isProfane(normalized.replace(/-/g, ' '))) continue;
    out.add(normalized);
  }
  return [...out].sort();
}

let blocked;

async function write(file, words) {
  await writeFile(path.join(OUT, file), `${words.join('\n')}\n`);
  log(`${file}: ${words.length} words`);
}

await mkdir(OUT, { recursive: true });
blocked = parseBlocklist(await readFile(path.join(OUT, 'starter', 'blocked.txt'), 'utf8'));

log('Names');
const ssa = await attempt('SSA baby names', () => fetchSsaNames());
const nltk = await attempt('NLTK names list', fetchNltkNames);
const names = clean([...ssa, ...nltk, ...(await starter('names.txt'))]);
await write(
  'names.txt',
  names.filter((w) => !blocked.name.has(w)),
);

log('Places');
const countries = require('world-countries');
const countryNames = countries.flatMap((c) => [c.name.common, ...(c.capital ?? [])]);
log(`  world-countries: ${countryNames.length} entries`);
const wikidata = await attempt('Wikidata places', () => fetchWikidataPlaces(log));
const places = clean([...countryNames, ...wikidata, ...(await starter('places.txt'))]);
await write(
  'places.txt',
  places.filter((w) => !blocked.place.has(w)),
);

log('Animals and things (WordNet)');
const dictDir = path.join(path.dirname(require.resolve('wordnet-db/package.json')), 'dict');
const { graph, root } = await loadWordnet(dictDir);
const animalSet = descendants(graph, root('animal'));
const animalLemmas = lemmasOf(graph, animalSet);
const animals = clean([...animalLemmas, ...(await starter('animals.txt'))]);
await write(
  'animals.txt',
  animals.filter((w) => !blocked.animal.has(w)),
);

const excluded = new Set([
  ...animalSet,
  ...descendants(graph, root('person')),
  ...descendants(graph, root('location')),
]);
const physical = [
  ...descendants(graph, root('physical_entity')),
  ...descendants(graph, root('artifact')),
];
const thingOffsets = new Set(physical.filter((offset) => !excluded.has(offset)));
const blocked = new Set([...names, ...places, ...animals]);
const things = clean([...lemmasOf(graph, thingOffsets), ...(await starter('things.txt'))]).filter(
  (word) =>
    !blocked.has(word) ||
    ['apple', 'bat', 'seal', 'crane', 'cricket', 'jaguar', 'mercury'].includes(word),
);
await write(
  'things.txt',
  things.filter((w) => !blocked.thing.has(w)),
);
log('Done. Review the files, then commit them. Sources are listed in docs/DICTIONARY_SOURCES.md.');
