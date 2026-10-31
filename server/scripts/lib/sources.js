import { unzipSync, strFromU8 } from 'fflate';

const DEFAULT_UA = 'FastFour/1.0 (creatiquework@gmail.com)';
const userAgent = () => process.env.WIKIDATA_USER_AGENT || DEFAULT_UA;

async function getBuffer(url, ms = 60_000) {
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent() },
    signal: AbortSignal.timeout(ms),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** US Social Security Administration baby names, public domain. Names given at least `minCount` times. */
export async function fetchSsaNames(minCount = 200) {
  const files = unzipSync(await getBuffer('https://www.ssa.gov/oact/babynames/names.zip', 120_000));
  const totals = new Map();
  for (const [name, bytes] of Object.entries(files)) {
    if (!/yob\d{4}\.txt$/.test(name)) continue;
    for (const line of strFromU8(bytes).split('\n')) {
      const [first, , count] = line.trim().split(',');
      if (first) totals.set(first, (totals.get(first) ?? 0) + Number(count));
    }
  }
  return [...totals].filter(([, n]) => n >= minCount).map(([first]) => first);
}

/** Mark Kantrowitz's name list from the NLTK data project (public domain). */
export async function fetchNltkNames() {
  const url =
    'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/names.zip';
  const files = unzipSync(await getBuffer(url));
  const names = [];
  for (const [file, bytes] of Object.entries(files)) {
    if (!/(male|female)\.txt$/.test(file)) continue;
    for (const line of strFromU8(bytes).split('\n')) {
      if (line && !line.startsWith('#')) names.push(line.trim());
    }
  }
  return names;
}

async function sparql(query, ms) {
  const url = new URL('https://query.wikidata.org/sparql');
  url.search = new URLSearchParams({ query, format: 'json' }).toString();
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent(), Accept: 'application/sparql-results+json' },
    signal: AbortSignal.timeout(ms),
  });
  if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);
  return (await response.json()).results.bindings.map((b) => b.label.value);
}

/** Place classes. Each id is checked against its English label before use. */
export const PLACE_CLASSES = [
  { id: 'Q6256', label: 'country' },
  { id: 'Q10864048', label: 'first-level administrative country subdivision' },
  { id: 'Q5119', label: 'capital' },
  { id: 'Q515', label: 'city', minPopulation: 50_000 },
  { id: 'Q3957', label: 'town', minPopulation: 50_000 },
  { id: 'Q1549591', label: 'big city', minPopulation: 50_000 },
  { id: 'Q4022', label: 'river' },
  { id: 'Q23397', label: 'lake' },
  { id: 'Q8502', label: 'mountain' },
  { id: 'Q23442', label: 'island' },
  { id: 'Q165', label: 'sea' },
  { id: 'Q9430', label: 'ocean' },
  { id: 'Q5107', label: 'continent' },
];

async function labelOf(id) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'wbgetentities',
    ids: id,
    props: 'labels',
    languages: 'en',
    format: 'json',
  }).toString();
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent() },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);
  return (await response.json()).entities?.[id]?.labels?.en?.value ?? '';
}

/**
 * Places from the Wikidata Query Service, page by page. A class whose label does not match is skipped.
 * A page that times out is retried with half the page size.
 * @param {(message: string) => void} log
 */
export async function fetchWikidataPlaces(log) {
  const places = [];
  for (const cls of PLACE_CLASSES) {
    const label = await labelOf(cls.id);
    if (label.toLowerCase() !== cls.label.toLowerCase()) {
      log(`  skipping ${cls.id}: expected "${cls.label}" but Wikidata says "${label}"`);
      continue;
    }
    let size = 5000;
    let offset = 0;
    let total = 0;
    for (let guard = 0; guard < 200; guard += 1) {
      const population = cls.minPopulation
        ? `?c wdt:P1082 ?p . FILTER(?p >= ${cls.minPopulation})`
        : '';
      const query = `SELECT DISTINCT ?label WHERE { ?c wdt:P31/wdt:P279* wd:${cls.id} . ${population} ?c rdfs:label ?label . FILTER(LANG(?label) = "en") } LIMIT ${size} OFFSET ${offset}`;
      try {
        const rows = await sparql(query, 90_000);
        places.push(...rows);
        total += rows.length;
        if (rows.length < size) break;
        offset += size;
      } catch (err) {
        if (size <= 250) {
          log(`  ${cls.label}: giving up after ${total} entries (${err.message})`);
          break;
        }
        size = Math.floor(size / 2);
        log(`  ${cls.label}: ${err.message}, retrying with page size ${size}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    log(`  ${cls.label}: ${total} entries`);
  }
  return places;
}
