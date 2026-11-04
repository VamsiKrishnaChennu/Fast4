/* Builds server/data/dictionary/{names,places,animals,things}.txt.
   Run on a machine with internet access: npm run dictionary:build

   Options
     --allow-fallback         carry on when SSA, Wikidata or WordNet gave nothing (the lists then come
                              from the curated starter files only)
     --only=names,places      rebuild only some lists (the sources document is not updated)
     --refresh                ignore the cached Wikidata answers in downloads/wikidata
     --no-wikidata-things     leave the Wikidata object classes out of things
     --accept-large-places    write places.txt even when it is over 15 MB

   Sources are listed in docs/DICTIONARY_SOURCES.md. Downloads are cached in
   server/data/dictionary/downloads (not committed). */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBlocklist } from './lib/blocklist.js';
import { composeList, emptyRequiredSources } from './lib/compose.js';
import { loadOewn } from './lib/oewn.js';
import { createProfanityCheck } from './lib/profanity.js';
import { formatTable, writeTable } from './lib/report.js';
import { selectAnimalsAndThings } from './lib/selection.js';
import { ensureOewn, fetchNltkNames, fetchSsaNames } from './lib/sources.js';
import {
  createWikidataClient,
  fetchWikidataAnimals,
  fetchWikidataNames,
  fetchWikidataPlaces,
  fetchWikidataThings,
} from './lib/wikidata.js';
import { loadWordnet } from './lib/wordnet.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'data', 'dictionary');
const DOWNLOADS = path.join(OUT, 'downloads');
const SOURCES_DOC = path.join(here, '..', '..', 'docs', 'DICTIONARY_SOURCES.md');
const MAX_PLACES_BYTES = 15_000_000;
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const only = args
  .find((a) => a.startsWith('--only='))
  ?.slice(7)
  .split(',');
const wants = (category) => !only || only.includes(category);
const allowFallback = has('--allow-fallback');
const log = (message) => process.stdout.write(`${message}\n`);

const isProfane = createProfanityCheck();

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

/** Runs one source. A failure is recorded, not thrown, so the report can show every source at once. */
async function attempt(source, fn, extra = {}) {
  try {
    const labels = await fn();
    log(`  ${source}: ${labels.length} entries`);
    return { source, labels, ...extra };
  } catch (err) {
    log(`  ${source}: NOT AVAILABLE (${err.message})`);
    return { source, labels: [], error: err.message, ...extra };
  }
}

const flatten = (parts) => parts.flatMap((part) => part.labels);
const wikidataParts = (parts) =>
  parts
    .filter((p) => !p.skipped)
    .map((p) => `${p.name} ${p.labels.length}${p.complete === false ? ' INCOMPLETE' : ''}`)
    .join(', ');
const phrase = (min, max) => (label) =>
  new RegExp(`^[A-Za-z]+(?:[ -][A-Za-z]+){${min},${max}}$`).test(label) ||
  (min === 0 && /^[A-Za-z]+$/.test(label));

await mkdir(DOWNLOADS, { recursive: true });
const blockedWords = parseBlocklist(
  await readFile(path.join(OUT, 'starter', 'blocked.txt'), 'utf8'),
);
const client = createWikidataClient({
  cacheDir: path.join(DOWNLOADS, 'wikidata'),
  log,
  refresh: has('--refresh'),
});

const lists = {};

if (wants('names')) {
  log('Names');
  lists.names = composeList({
    category: 'name',
    isProfane,
    blocked: blockedWords.name,
    contributions: [
      await attempt(
        'SSA baby names',
        () => fetchSsaNames({ downloadsDir: DOWNLOADS, minCount: 50, log }),
        { required: true },
      ),
      await attempt('NLTK names list', fetchNltkNames),
      await (async () => {
        let parts = [];
        const result = await attempt(
          'Wikidata given names',
          async () => {
            parts = await fetchWikidataNames(client, log);
            return flatten(parts);
          },
          { required: true },
        );
        if (parts.length) log(`    ${wikidataParts(parts)}`);
        return result;
      })(),
      await attempt('Curated (starter/names.txt)', () => starter('names.txt')),
    ],
  });
}

if (wants('places')) {
  log('Places');
  const countries = require('world-countries');
  lists.places = composeList({
    category: 'place',
    isProfane,
    blocked: blockedWords.place,
    contributions: [
      {
        source: 'world-countries package',
        labels: countries.flatMap((c) => [c.name.common, ...(c.capital ?? [])]),
      },
      await (async () => {
        let parts = [];
        const result = await attempt(
          'Wikidata places',
          async () => {
            parts = await fetchWikidataPlaces(client, log);
            return flatten(parts);
          },
          { required: true, plausible: true, minLetters: 3 },
        );
        if (parts.length) log(`    ${wikidataParts(parts)}`);
        return result;
      })(),
      await attempt('Curated (starter/places.txt)', () => starter('places.txt')),
    ],
  });
}

if (wants('animals') || wants('things')) {
  log('Animals and things (WordNet)');
  const dictDir = path.join(path.dirname(require.resolve('wordnet-db/package.json')), 'dict');
  let wn = { animals: new Set(), things: new Set() };
  let oewn = { animals: new Set(), things: new Set() };
  let wnError;
  let oewnError;
  try {
    wn = selectAnimalsAndThings(await loadWordnet(dictDir));
  } catch (err) {
    wnError = err.message;
    log(`  WordNet 3.1: NOT AVAILABLE (${err.message})`);
  }
  try {
    const file = await ensureOewn({ downloadsDir: DOWNLOADS, log });
    // Open English WordNet files people under "doer" as well as "person".
    oewn = selectAnimalsAndThings(await loadOewn(file), { extraExcludedRoots: ['doer'] });
  } catch (err) {
    oewnError = err.message;
    log(`  Open English WordNet 2024: NOT AVAILABLE (${err.message})`);
  }
  log(
    `  WordNet 3.1: ${wn.animals.size} animals, ${wn.things.size} things; OEWN 2024: ${oewn.animals.size} animals, ${oewn.things.size} things`,
  );

  if (wants('animals')) {
    log('Animals');
    lists.animals = composeList({
      category: 'animal',
      isProfane,
      blocked: blockedWords.animal,
      contributions: [
        { source: 'WordNet 3.1', labels: wn.animals, required: true, error: wnError },
        { source: 'Open English WordNet 2024', labels: oewn.animals, error: oewnError },
        await (async () => {
          let parts = [];
          const result = await attempt('Wikidata animal common names', async () => {
            parts = await fetchWikidataAnimals(client, log);
            return flatten(parts).filter(phrase(0, 2));
          });
          return result;
        })(),
        await attempt('Curated (starter/animals.txt)', () => starter('animals.txt')),
      ],
    });
  }

  if (wants('things')) {
    log('Things');
    lists.things = composeList({
      category: 'thing',
      isProfane,
      blocked: blockedWords.thing,
      contributions: [
        { source: 'WordNet 3.1', labels: wn.things, required: true, error: wnError },
        { source: 'Open English WordNet 2024', labels: oewn.things, error: oewnError },
        has('--no-wikidata-things')
          ? { source: 'Wikidata object classes (skipped)', labels: [] }
          : await attempt('Wikidata object classes', async () =>
              flatten(await fetchWikidataThings(client, log)).filter(phrase(0, 1)),
            ),
        await attempt('Curated (starter/things.txt)', () => starter('things.txt')),
      ],
    });
  }
}

// Report before writing anything, so a failed build never leaves half-written lists.
const built = Object.values(lists);
const rows = built.flatMap((list) => list.rows);
log('\nPer-source table');
log(formatTable(rows));
for (const list of built) {
  for (const row of list.rows) {
    const rejected = Object.entries(row.rejects)
      .map(([why, count]) => `${why} ${count}`)
      .join(', ');
    if (rejected) log(`  rejected from ${row.category} / ${row.source}: ${rejected}`);
  }
  if (list.profane.length) {
    log(
      `  profanity filter removed ${list.profane.length}: ${list.profane.slice(0, 60).join(', ')}${list.profane.length > 60 ? ', ...' : ''}`,
    );
  }
}

const missing = emptyRequiredSources(rows);
if (missing.length && !allowFallback) {
  log('\nBUILD STOPPED. These required sources gave no entries:');
  for (const row of missing) log(`  - ${row.category} / ${row.source}: ${row.error ?? 'empty'}`);
  log(
    'Nothing was written. Fix the problem above, or run with --allow-fallback to build from the curated lists only.',
  );
  process.exit(1);
}
if (missing.length) log('\n--allow-fallback: continuing without the sources above.');

const placesBytes = lists.places ? Buffer.byteLength(`${lists.places.words.join('\n')}\n`) : 0;
if (placesBytes > MAX_PLACES_BYTES && !has('--accept-large-places')) {
  log(
    `\nBUILD STOPPED. places.txt would be ${(placesBytes / 1e6).toFixed(1)} MB (limit ${MAX_PLACES_BYTES / 1e6} MB). Nothing was written. Ask the owner, then run again with --accept-large-places.`,
  );
  process.exit(2);
}

const files = {
  names: 'names.txt',
  places: 'places.txt',
  animals: 'animals.txt',
  things: 'things.txt',
};
for (const [key, list] of Object.entries(lists)) {
  await writeFile(path.join(OUT, files[key]), `${list.words.join('\n')}\n`);
  log(`${files[key]}: ${list.words.length} words`);
}

// Fifty random new words from the two supplements that might be noisy, for the owner to review.
const samples = [];
for (const row of rows) {
  if (!/^Wikidata (object classes|animal)/.test(row.source) || row.addedWords.length === 0)
    continue;
  const picked = [...row.addedWords].sort(() => Math.random() - 0.5).slice(0, 50);
  samples.push(`${row.category} / ${row.source} (${row.added} new):\n  ${picked.join(', ')}`);
}
if (samples.length) {
  const text = samples.join('\n\n');
  await writeFile(path.join(DOWNLOADS, 'review-samples.txt'), `${text}\n`);
  log(`\nReview these samples. If they look noisy, rebuild with --no-wikidata-things.\n${text}`);
}

if (!only) {
  const stamp = `Built ${new Date().toISOString().slice(0, 10)}.`;
  await writeTable(SOURCES_DOC, formatTable(rows), stamp);
  log('\nPer-source table written to docs/DICTIONARY_SOURCES.md');
}
log(
  'Done. Review the files, then commit them. Next: npm run dictionary:seed -- --replace, then restart the server.',
);
