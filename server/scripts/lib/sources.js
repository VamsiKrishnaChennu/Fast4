import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { strFromU8, unzipSync } from 'fflate';

const PROJECT_UA = process.env.WIKIDATA_USER_AGENT || 'FastFour/1.0 (creatiquework@gmail.com)';
/** Some sites block unknown clients. A descriptive compatible agent is the second attempt. */
const COMPATIBLE_UA = `Mozilla/5.0 (compatible; FastFourBuild/1.0; +mailto:creatiquework@gmail.com)`;

const SSA_URL = 'https://www.ssa.gov/oact/babynames/names.zip';
export const OEWN_URL =
  'https://github.com/globalwordnet/english-wordnet/releases/download/2024-edition/english-wordnet-2024.xml.gz';

const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  );

async function getBuffer(url, userAgents, ms = 120_000, fetchImpl = fetch) {
  const problems = [];
  for (const userAgent of userAgents) {
    try {
      const response = await fetchImpl(url, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(ms),
      });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      problems.push(`HTTP ${response.status} ${response.statusText} (User-Agent "${userAgent}")`);
    } catch (err) {
      problems.push(`${err.message}${err.cause ? `: ${err.cause.message ?? err.cause}` : ''}`);
    }
  }
  throw new Error(`${url} -> ${problems.join(' | ')}`);
}

/**
 * Adds up the baby-name files (name,sex,count per year) and keeps names given at least `minCount`
 * times in total.
 * @param {Uint8Array} zip contents of names.zip
 * @param {number} minCount
 * @returns {string[]}
 */
export function namesFromSsaZip(zip, minCount = 50) {
  const totals = new Map();
  for (const [name, bytes] of Object.entries(unzipSync(zip))) {
    if (!/yob\d{4}\.txt$/.test(name)) continue;
    for (const line of strFromU8(bytes).split('\n')) {
      const [first, , count] = line.trim().split(',');
      if (first) totals.set(first, (totals.get(first) ?? 0) + Number(count));
    }
  }
  return [...totals].filter(([, n]) => n >= minCount).map(([first]) => first);
}

/**
 * US Social Security Administration baby names (public domain). Uses downloads/names.zip when it
 * exists, so the file can be fetched by hand when the site blocks the build. A successful download
 * is saved there for the next build.
 * @param {{ downloadsDir: string, minCount?: number, log?: (message: string) => void, fetchImpl?: typeof fetch }} options
 */
export async function fetchSsaNames({ downloadsDir, minCount = 50, log = () => {}, fetchImpl }) {
  const local = path.join(downloadsDir, 'names.zip');
  if (await exists(local)) {
    log(`  SSA: using ${local}`);
    return namesFromSsaZip(new Uint8Array(await readFile(local)), minCount);
  }
  let zip;
  try {
    zip = await getBuffer(SSA_URL, [PROJECT_UA, COMPATIBLE_UA], 120_000, fetchImpl);
  } catch (err) {
    throw new Error(
      `${err.message}. Download names.zip from https://www.ssa.gov/oact/babynames/limits.html ("National data") and save it as ${local}, then run the build again.`,
    );
  }
  await mkdir(downloadsDir, { recursive: true });
  await writeFile(local, zip);
  return namesFromSsaZip(zip, minCount);
}

/** Mark Kantrowitz's name list from the NLTK data project (public domain). */
export async function fetchNltkNames(fetchImpl) {
  const url =
    'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/names.zip';
  const files = unzipSync(await getBuffer(url, [PROJECT_UA], 60_000, fetchImpl));
  const names = [];
  for (const [file, bytes] of Object.entries(files)) {
    if (!/(male|female)\.txt$/.test(file)) continue;
    for (const line of strFromU8(bytes).split('\n')) {
      if (line && !line.startsWith('#')) names.push(line.trim());
    }
  }
  return names;
}

/**
 * Open English WordNet 2024 (CC BY 4.0). Uses the cached file when it exists. Returns its path.
 * @param {{ downloadsDir: string, log?: (message: string) => void, fetchImpl?: typeof fetch }} options
 */
export async function ensureOewn({ downloadsDir, log = () => {}, fetchImpl = fetch }) {
  const file = path.join(downloadsDir, 'oewn-2024.xml.gz');
  if (await exists(file)) return file;
  log('  downloading Open English WordNet 2024 (about 13 MB)');
  await mkdir(downloadsDir, { recursive: true });
  let response;
  try {
    response = await fetchImpl(OEWN_URL, {
      headers: { 'User-Agent': PROJECT_UA },
      signal: AbortSignal.timeout(300_000),
    });
  } catch (err) {
    throw new Error(
      `${err.message}. Download ${OEWN_URL} and save it as ${file}, then run the build again.`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} for ${OEWN_URL}. Download it by hand and save it as ${file}.`,
    );
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  return file;
}
