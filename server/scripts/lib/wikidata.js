import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Word lists from Wikidata (CC0), for the dictionary build only. Every query returns plain English
 * labels, sorted, in pages. Paging uses ORDER BY on the label, so pages do not overlap or skip.
 * Results are cached on disk so a long build can be stopped and started again.
 */

const SPARQL_URL = 'https://query.wikidata.org/sparql';
const API_URL = 'https://www.wikidata.org/w/api.php';
const DEFAULT_UA = 'FastFour/1.0 (creatiquework@gmail.com)';

const ENGLISH_ARTICLE = '?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> .';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const INDIA = 'Q668';

/** Classes whose Wikidata ids are checked against their English label before use. */
export const NAME_CLASSES = [
  { id: 'Q202444', label: 'given name' },
  { id: 'Q11879590', label: 'female given name' },
  { id: 'Q12308941', label: 'male given name' },
  { id: 'Q3409032', label: 'unisex given name' },
  { id: 'Q3409027', label: 'double given name' },
];

/** Places: no population cutoff, but each item needs an English Wikipedia article. */
export const PLACE_CLASSES = [
  { id: 'Q6256', label: 'country' },
  { id: 'Q10864048', label: 'first-level administrative country subdivision' },
  { id: 'Q5119', label: 'capital' },
  { id: 'Q515', label: 'city' },
  { id: 'Q4022', label: 'river' },
  { id: 'Q23397', label: 'lake' },
  { id: 'Q8502', label: 'mountain' },
  { id: 'Q23442', label: 'island' },
  { id: 'Q165', label: 'sea' },
  { id: 'Q9430', label: 'ocean' },
  { id: 'Q5107', label: 'continent' },
  { id: 'Q1149652', label: 'district of India' },
  { id: 'Q12443800', label: 'state of India' },
  { id: 'Q467745', label: 'union territory of India' },
];
export const SETTLEMENT_CLASS = { id: 'Q486972', label: 'human settlement' };
export const ADMIN_ENTITY_CLASS = { id: 'Q56061', label: 'administrative territorial entity' };
export const SOVEREIGN_STATE_CLASS = { id: 'Q3624078', label: 'sovereign state' };
export const ANIMALIA = { id: 'Q729', label: 'animal', alsoLabeled: ['Animalia'] };

/** Kinds of physical object. Items below these classes with a lower-case one or two word label are kept. */
export const THING_CLASSES = [
  { id: 'Q39546', label: 'tool' },
  { id: 'Q987767', label: 'container' },
  { id: 'Q42889', label: 'vehicle' },
  { id: 'Q11460', label: 'clothing' },
  { id: 'Q3314483', label: 'footwear' },
  { id: 'Q1017100', label: 'headgear' },
  { id: 'Q161439', label: 'jewellery' },
  { id: 'Q14745', label: 'furniture' },
  { id: 'Q11422', label: 'toy' },
  { id: 'Q34379', label: 'musical instrument' },
  { id: 'Q212920', label: 'home appliance' },
  { id: 'Q1070731', label: 'kitchenware' },
  { id: 'Q1476', label: 'stationery' },
  { id: 'Q768717', label: 'sports equipment' },
  { id: 'Q1137289', label: 'electronic device' },
];

const page = (size, offset) => `LIMIT ${size} OFFSET ${offset}`;

/** @returns {string} SPARQL for the English labels (or aliases) of items of the given-name classes */
export function nameQuery({ classId, alias = false, size, offset }) {
  const field = alias ? 'skos:altLabel' : 'rdfs:label';
  return `SELECT DISTINCT ?label WHERE { ?c wdt:P31 wd:${classId} . ?c ${field} ?label . FILTER(LANG(?label) = "en") } ORDER BY ?label ${page(size, offset)}`;
}

/**
 * @param {{ classId: string, countryId?: string, size: number, offset: number }} options
 * @returns {string} SPARQL for the English labels of places of a class that have an English Wikipedia article
 */
export function placeQuery({ classId, countryId, size, offset }) {
  const country = countryId ? `?c wdt:P17 wd:${countryId} .` : '';
  return `SELECT DISTINCT ?label WHERE { ?c wdt:P31/wdt:P279* wd:${classId} . ${country} ${ENGLISH_ARTICLE} ?c rdfs:label ?label . FILTER(LANG(?label) = "en") } ORDER BY ?label ${page(size, offset)}`;
}

/** @returns {string} SPARQL for the sovereign states that still exist */
export function countriesQuery() {
  return `SELECT DISTINCT ?country WHERE { ?country wdt:P31 wd:${SOVEREIGN_STATE_CLASS.id} . FILTER NOT EXISTS { ?country wdt:P576 ?ended } }`;
}

/**
 * Animal taxa with an English common name (P1843) that start with one letter. The parent-taxon walk
 * goes upward from each candidate, which is the cheap direction.
 * @returns {string}
 */
export function animalQuery({ letter, size, offset }) {
  return `SELECT DISTINCT ?label WHERE { ?c wdt:P1843 ?label . FILTER(LANG(?label) = "en" && STRSTARTS(LCASE(STR(?label)), "${letter}")) ?c wdt:P171+ wd:${ANIMALIA.id} . hint:Prior hint:gearing "forward" . } ORDER BY ?label ${page(size, offset)}`;
}

/** @returns {string} SPARQL for lower-case one or two word labels of subclasses of a physical-object class */
export function thingQuery({ classId, size, offset }) {
  return `SELECT DISTINCT ?label WHERE { ?c wdt:P279* wd:${classId} . ${ENGLISH_ARTICLE} ?c rdfs:label ?label . FILTER(LANG(?label) = "en" && REGEX(STR(?label), "^[a-z]+([ -][a-z]+)?$")) } ORDER BY ?label ${page(size, offset)}`;
}

/** An error that retrying with a smaller page cannot fix (no network, blocked). */
export class NetworkError extends Error {}

/**
 * @param {{ fetchImpl?: typeof fetch, cacheDir?: string, log?: (message: string) => void, refresh?: boolean,
 *   pauseMs?: number, sleep?: (ms: number) => Promise<void>, userAgent?: string }} [options]
 */
export function createWikidataClient({
  fetchImpl = fetch,
  cacheDir,
  log = () => {},
  refresh = false,
  pauseMs = 1500,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  userAgent = process.env.WIKIDATA_USER_AGENT || DEFAULT_UA,
} = {}) {
  let first = true;

  async function get(url, accept, ms) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { 'User-Agent': userAgent, Accept: accept },
        signal: AbortSignal.timeout(ms),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        const timeout = new Error('timed out');
        timeout.timedOut = true;
        throw timeout;
      }
      throw new NetworkError(
        `${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`,
      );
    }
    return response;
  }

  /** Runs one query. Waits and retries on "too many requests". Returns the bindings. */
  async function sparql(query, ms = 65_000) {
    const url = new URL(SPARQL_URL);
    url.search = new URLSearchParams({ query, format: 'json' }).toString();
    for (let attempt = 0; ; attempt += 1) {
      if (!first) await sleep(pauseMs);
      first = false;
      const response = await get(url, 'application/sparql-results+json', ms);
      if (response.status === 429 && attempt < 4) {
        const wait = Math.min(Number(response.headers.get('retry-after')) || 30, 120);
        log(`  Wikidata asks us to slow down; waiting ${wait} s`);
        await sleep(wait * 1000);
        continue;
      }
      if (!response.ok) {
        const error = new Error(`Wikidata HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return (await response.json()).results.bindings;
    }
  }

  async function api(params) {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({ format: 'json', ...params }).toString();
    const response = await get(url, 'application/json', 30_000);
    if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);
    return response.json();
  }

  /**
   * True when the id's English label is the expected one. Otherwise logs what Wikidata says and the
   * closest matches by name, so the id in this file can be corrected.
   */
  async function verifyClass({ id, label, alsoLabeled = [] }) {
    const body = await api({
      action: 'wbgetentities',
      ids: id,
      props: 'labels',
      languages: 'en',
    });
    const actual = body.entities?.[id]?.labels?.en?.value ?? '';
    const accepted = [label, ...alsoLabeled].map((l) => l.toLowerCase());
    if (accepted.includes(actual.toLowerCase())) return true;
    let hint = '';
    try {
      const found = await api({
        action: 'wbsearchentities',
        search: label,
        language: 'en',
        type: 'item',
        limit: '5',
      });
      hint = ` Closest items: ${(found.search ?? []).map((i) => `${i.id} "${i.label}" (${i.description ?? ''})`).join('; ')}`;
    } catch {
      // The hint is optional.
    }
    log(`  skipping ${id}: expected "${label}" but Wikidata says "${actual}".${hint}`);
    return false;
  }

  async function readCache(key) {
    if (!cacheDir || refresh) return null;
    try {
      return JSON.parse(await readFile(path.join(cacheDir, `${key}.json`), 'utf8'));
    } catch {
      return null;
    }
  }

  async function writeCache(key, rows) {
    if (!cacheDir) return;
    await mkdir(cacheDir, { recursive: true });
    await writeFile(path.join(cacheDir, `${key}.json`), JSON.stringify(rows));
  }

  /**
   * Reads every page of one query. A page that fails is retried with half the page size. Results are
   * cached when the whole query finished.
   * @param {{ name: string, build: (size: number, offset: number) => string, variable?: string, size?: number, minSize?: number }} options
   * @returns {Promise<{ rows: string[], complete: boolean, cached: boolean }>}
   */
  async function pagedLabels({ name, build, variable = 'label', size = 5000, minSize = 250 }) {
    const key = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${createHash('sha1').update(build(1, 0)).digest('hex').slice(0, 8)}`;
    const cached = await readCache(key);
    if (cached) return { rows: cached, complete: true, cached: true };
    const rows = [];
    let offset = 0;
    let pageSize = size;
    for (let guard = 0; guard < 500; guard += 1) {
      let bindings;
      try {
        bindings = await sparql(build(pageSize, offset));
      } catch (err) {
        if (err instanceof NetworkError) throw err;
        if (pageSize <= minSize) {
          log(`  ${name}: giving up after ${rows.length} entries (${err.message})`);
          return { rows, complete: false, cached: false };
        }
        pageSize = Math.floor(pageSize / 2);
        log(`  ${name}: ${err.message}, retrying with page size ${pageSize}`);
        continue;
      }
      rows.push(...bindings.map((b) => b[variable].value));
      offset += bindings.length;
      if (bindings.length < pageSize) {
        await writeCache(key, rows);
        return { rows, complete: true, cached: false };
      }
    }
    log(`  ${name}: stopped at the page limit with ${rows.length} entries`);
    return { rows, complete: false, cached: false };
  }

  return { sparql, verifyClass, pagedLabels };
}

/** @returns {boolean} true for a single Latin-script word (used for aliases) */
export const isSingleWord = (text) => /^[A-Za-zÀ-ɏ]+$/.test(text);

async function runClasses(client, log, classes, queryFor, label = (c) => c.label) {
  const parts = [];
  for (const cls of classes) {
    if (!(await client.verifyClass(cls))) {
      parts.push({ name: label(cls), labels: [], skipped: true });
      continue;
    }
    const { rows, complete, cached } = await queryFor(cls);
    log(
      `  ${label(cls)}: ${rows.length} entries${cached ? ' (cached)' : ''}${complete ? '' : ' (INCOMPLETE)'}`,
    );
    parts.push({ name: label(cls), labels: rows, skipped: false, complete });
  }
  return parts;
}

/**
 * Given names: English labels of the five given-name classes, plus English aliases that are one word.
 * @returns {Promise<Array<{ name: string, labels: string[], skipped: boolean }>>}
 */
export async function fetchWikidataNames(client, log) {
  const labels = await runClasses(client, log, NAME_CLASSES, (cls) =>
    client.pagedLabels({
      name: `names-${cls.label}`,
      build: (size, offset) => nameQuery({ classId: cls.id, size, offset }),
    }),
  );
  const aliases = await runClasses(
    client,
    log,
    NAME_CLASSES,
    async (cls) => {
      const result = await client.pagedLabels({
        name: `name-aliases-${cls.label}`,
        build: (size, offset) => nameQuery({ classId: cls.id, alias: true, size, offset }),
      });
      return { ...result, rows: result.rows.filter(isSingleWord) };
    },
    (cls) => `${cls.label} (aliases)`,
  );
  return [...labels, ...aliases];
}

/**
 * Places: each class needs an English Wikipedia article, with no population cutoff. Settlements are
 * fetched one country at a time so that each query finishes well inside the 60 second limit. A
 * separate pass reads India's settlements and administrative units.
 */
export async function fetchWikidataPlaces(client, log) {
  const parts = await runClasses(client, log, PLACE_CLASSES, (cls) =>
    client.pagedLabels({
      name: `places-${cls.label}`,
      build: (size, offset) => placeQuery({ classId: cls.id, size, offset }),
    }),
  );

  if (await client.verifyClass(SOVEREIGN_STATE_CLASS)) {
    const countries = (await client.sparql(countriesQuery())).map((b) =>
      b.country.value.split('/').pop(),
    );
    log(`  settlements: ${countries.length} countries`);
    if (await client.verifyClass(SETTLEMENT_CLASS)) {
      const labels = [];
      for (const countryId of countries) {
        const { rows } = await client.pagedLabels({
          name: `settlements-${countryId}`,
          build: (size, offset) =>
            placeQuery({ classId: SETTLEMENT_CLASS.id, countryId, size, offset }),
        });
        labels.push(...rows);
      }
      log(`  settlements by country: ${labels.length} entries`);
      parts.push({ name: 'human settlement (per country)', labels, skipped: false });
    }
  }

  const india = [];
  for (const cls of [SETTLEMENT_CLASS, ADMIN_ENTITY_CLASS]) {
    if (!(await client.verifyClass(cls))) continue;
    const { rows } = await client.pagedLabels({
      name: `india-${cls.label}`,
      build: (size, offset) => placeQuery({ classId: cls.id, countryId: INDIA, size, offset }),
    });
    india.push(...rows);
  }
  log(`  India pass: ${india.length} entries`);
  parts.push({ name: 'India pass', labels: india, skipped: false });
  return parts;
}

/** Animal taxa with an English common name, one starting letter at a time. */
export async function fetchWikidataAnimals(client, log) {
  if (!(await client.verifyClass(ANIMALIA))) return [];
  const labels = [];
  for (const letter of LETTERS) {
    const { rows } = await client.pagedLabels({
      name: `animals-${letter}`,
      build: (size, offset) => animalQuery({ letter, size, offset }),
    });
    labels.push(...rows);
  }
  log(`  animal common names: ${labels.length} entries`);
  return [{ name: 'animal common names', labels, skipped: false }];
}

/** Subclasses of physical-object classes: lower-case one or two word labels with an English article. */
export async function fetchWikidataThings(client, log) {
  return runClasses(client, log, THING_CLASSES, (cls) =>
    client.pagedLabels({
      name: `things-${cls.label}`,
      build: (size, offset) => thingQuery({ classId: cls.id, size, offset }),
    }),
  );
}
