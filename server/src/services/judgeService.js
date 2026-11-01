import { LIMITS, normalizeAnswer } from '@fastfour/shared';
import { JudgeUnavailableError } from '../utils/AppErrors.js';

/**
 * Wikidata classes used by the word check. Verified by `npm run judge:evaluate`, which fetches each
 * label and stops if one does not match.
 */
export const WIKIDATA_CLASSES = {
  givenName: { id: 'Q202444', label: 'given name' },
  maleGivenName: { id: 'Q12308941', label: 'male given name' },
  femaleGivenName: { id: 'Q11879590', label: 'female given name' },
  unisexGivenName: { id: 'Q3409032', label: 'unisex given name' },
  animalia: { id: 'Q729', label: 'Animalia' },
};

const NAME_CLASSES = ['givenName', 'maleGivenName', 'femaleGivenName', 'unisexGivenName'];
const ANIMAL_WORDS = [
  'animal',
  'mammal',
  'bird',
  'fish',
  'insect',
  'reptile',
  'amphibian',
  'rodent',
];
const DAY = 24 * 60 * 60 * 1000;

/** Cache lifetime by result: valid never expires, invalid 30 days, inconclusive 1 day. */
const CACHE_TTL = { valid: null, invalid: 30 * DAY, inconclusive: DAY };

/**
 * A cache that lives in memory. Phase 8 swaps in a MongoDB-backed JudgeCache with the same interface.
 * @param {() => number} [now]
 */
export function createMemoryJudgeCache(now = Date.now) {
  const map = new Map();
  return {
    async get(category, word) {
      const hit = map.get(`${category}:${word}`);
      if (!hit) return null;
      if (hit.expireAt !== null && hit.expireAt <= now()) {
        map.delete(`${category}:${word}`);
        return null;
      }
      return hit;
    },
    async set(category, word, entry) {
      map.set(`${category}:${word}`, entry);
    },
  };
}

/** Allows at most `limit` tasks at once. */
function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || queue.length === 0) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    task()
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
}

/**
 * Checks one word with Wikidata or the Free Dictionary API. Only the word is ever sent.
 * @param {object} deps
 * @param {object} deps.env validated configuration
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {ReturnType<typeof createMemoryJudgeCache>} [deps.cache]
 * @param {() => number} [deps.now]
 * @param {(event: object) => void} [deps.debug] receives one event per request (source, url, status) and candidate counts
 * @returns {{ check: (category: string, word: string) => Promise<{ result: 'valid' | 'invalid' | 'inconclusive', source: string }> }}
 */
export function createJudgeService({ env, fetchImpl = fetch, cache, now = Date.now, debug }) {
  const store = cache ?? createMemoryJudgeCache(now);
  const inflight = new Map();
  const limiters = { wikidata: createLimiter(2), dictionaryapi: createLimiter(2) };
  const blockedUntil = { wikidata: 0, dictionaryapi: 0 };
  const headers = {
    'User-Agent': env.WIKIDATA_USER_AGENT ?? 'FastFour/1.0',
    Accept: 'application/json',
  };

  async function request(source, url, signal) {
    if (now() < blockedUntil[source]) {
      throw new JudgeUnavailableError(undefined, `${source} paused after http 429`);
    }
    return limiters[source](async () => {
      // One quick retry for a network failure or a server error; never for 429 or after the timeout.
      for (let attempt = 1; ; attempt += 1) {
        let response;
        try {
          response = await fetchImpl(url, { headers, signal });
        } catch (err) {
          debug?.({ source, url: String(url), error: err.name });
          const timedOut = signal?.aborted || err.name === 'AbortError';
          if (attempt === 1 && !timedOut) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          throw new JudgeUnavailableError(undefined, timedOut ? 'timeout' : 'network');
        }
        debug?.({ source, url: String(url), status: response.status });
        if (response.status === 429) {
          const wait = Number(response.headers?.get?.('retry-after')) || 2;
          blockedUntil[source] = now() + wait * 1000;
          throw new JudgeUnavailableError(undefined, 'http 429');
        }
        if (response.status >= 500) {
          if (attempt === 1 && !signal?.aborted) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          throw new JudgeUnavailableError(undefined, `http ${response.status}`);
        }
        return response;
      }
    });
  }

  async function wikidataCandidates(word, signal) {
    const url = new URL(env.WIKIDATA_API_URL);
    url.search = new URLSearchParams({
      action: 'wbsearchentities',
      search: word,
      language: 'en',
      type: 'item',
      limit: '20',
      format: 'json',
    }).toString();
    const response = await request('wikidata', url, signal);
    if (!response.ok) throw new JudgeUnavailableError(undefined, `http ${response.status}`);
    const body = await response.json();
    const found = (body.search ?? []).filter(
      (item) => normalizeAnswer(item.match?.text ?? item.label) === word,
    );
    debug?.({
      source: 'wikidata',
      step: 'candidates',
      hits: (body.search ?? []).length,
      matching: found.length,
    });
    return found.map((item) => item.id);
  }

  async function wikidataMatches(ids, query, signal) {
    const url = new URL(env.WIKIDATA_SPARQL_URL);
    url.search = new URLSearchParams({ query, format: 'json' }).toString();
    const response = await request('wikidata', url, signal);
    if (!response.ok) throw new JudgeUnavailableError(undefined, `http ${response.status}`);
    const body = await response.json();
    return (body.results?.bindings ?? []).length > 0;
  }

  const values = (ids) => ids.map((id) => `wd:${id}`).join(' ');
  const classValues = (keys) => keys.map((k) => `wd:${WIKIDATA_CLASSES[k].id}`).join(' ');

  const queries = {
    name: (ids) =>
      `SELECT ?item WHERE { VALUES ?item { ${values(ids)} } VALUES ?class { ${classValues(NAME_CLASSES)} } ?item wdt:P31/wdt:P279* ?class . } LIMIT 1`,
    // A place has map coordinates, a country, or sits inside an administrative area. These are single
    // lookups on the candidates, unlike a walk through the whole "geographic location" class tree,
    // which Wikidata often cannot finish in time.
    place: (ids) =>
      `SELECT ?item WHERE { VALUES ?item { ${values(ids)} } { ?item wdt:P625 ?x } UNION { ?item wdt:P17 ?x } UNION { ?item wdt:P131 ?x } } LIMIT 1`,
    // An animal has a chain of parent taxa that ends at Animalia.
    animal: (ids) =>
      `SELECT ?item WHERE { VALUES ?item { ${values(ids)} } ?item wdt:P171+ wd:${WIKIDATA_CLASSES.animalia.id} . } LIMIT 1`,
  };

  async function viaWikidata(category, word, signal) {
    const ids = await wikidataCandidates(word, signal);
    if (ids.length === 0) return { result: 'inconclusive', source: 'wikidata' };
    const fits = await wikidataMatches(ids, queries[category](ids), signal);
    return { result: fits ? 'valid' : 'invalid', source: 'wikidata' };
  }

  async function viaDictionary(word, signal) {
    const url = `${env.DICTIONARY_API_URL.replace(/\/$/, '')}/${encodeURIComponent(word)}`;
    const response = await request('dictionaryapi', url, signal);
    if (response.status === 404) return { status: 404, entries: [] };
    if (!response.ok) throw new JudgeUnavailableError(undefined, `http ${response.status}`);
    const entries = await response.json();
    return { status: 200, entries: Array.isArray(entries) ? entries : [] };
  }

  const nounCount = (entries) =>
    entries.flatMap((e) => e.meanings ?? []).filter((m) => m.partOfSpeech === 'noun').length;

  const hasAnimalWord = (entries) =>
    entries
      .flatMap((e) => e.meanings ?? [])
      .flatMap((m) => m.definitions ?? [])
      .some((d) =>
        ANIMAL_WORDS.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(d.definition ?? '')),
      );

  async function run(category, word, signal) {
    if (category === 'thing') {
      const { status, entries } = await viaDictionary(word, signal);
      const valid = status === 200 && nounCount(entries) > 0;
      return { result: valid ? 'valid' : 'invalid', source: 'dictionaryapi' };
    }
    const wiki = await viaWikidata(category, word, signal);
    if (category !== 'animal' || wiki.result !== 'inconclusive') return wiki;
    const { status, entries } = await viaDictionary(word, signal);
    if (status === 200 && hasAnimalWord(entries))
      return { result: 'valid', source: 'dictionaryapi' };
    return { result: 'inconclusive', source: 'dictionaryapi' };
  }

  async function checkUncached(category, word) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIMITS.JUDGE_TIMEOUT_MS);
    try {
      return await run(category, word, controller.signal);
    } catch (err) {
      if (err instanceof JudgeUnavailableError) throw err;
      throw new JudgeUnavailableError(
        undefined,
        err?.name === 'AbortError' ? 'timeout' : 'unexpected',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /**
     * @param {string} category name, place, animal or thing
     * @param {string} word normalized answer
     * @returns {Promise<{ result: 'valid' | 'invalid' | 'inconclusive', source: string }>}
     * @throws {JudgeUnavailableError} when the source cannot be reached or runs out of time
     */
    async check(category, word) {
      if (!env.JUDGE_ENABLED) return { result: 'inconclusive', source: 'none' };
      const cached = await store.get(category, word);
      if (cached) return { result: cached.result, source: 'cache' };

      const key = `${category}:${word}`;
      if (!inflight.has(key)) {
        const job = checkUncached(category, word)
          .then(async (outcome) => {
            const ttl = CACHE_TTL[outcome.result];
            await store.set(category, word, {
              result: outcome.result,
              source: outcome.source,
              checkedAt: now(),
              expireAt: ttl === null ? null : now() + ttl,
            });
            return outcome;
          })
          .finally(() => inflight.delete(key));
        inflight.set(key, job);
      }
      return inflight.get(key);
    },
  };
}
