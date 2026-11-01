/* Measures how well Wikidata and the Free Dictionary API judge words. Needs internet. Never run in CI.
   Usage: npm run judge:evaluate [-- --category=name] */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, loadEnvFile } from '../src/config/env.js';
import { createJudgeService, WIKIDATA_CLASSES } from '../src/services/judgeService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(here, '..', '.env'));
const env = loadEnv();
const out = (text = '') => process.stdout.write(`${text}\n`);
const only = process.argv.find((a) => a.startsWith('--category='))?.split('=')[1];

out('Step 1: checking the Wikidata class ids');
let idsOk = true;
for (const { id, label } of Object.values(WIKIDATA_CLASSES)) {
  const url = new URL(env.WIKIDATA_API_URL);
  url.search = new URLSearchParams({
    action: 'wbgetentities',
    ids: id,
    props: 'labels',
    languages: 'en',
    format: 'json',
  }).toString();
  const response = await fetch(url, {
    headers: { 'User-Agent': env.WIKIDATA_USER_AGENT ?? 'FastFour/1.0' },
  });
  const actual = (await response.json()).entities?.[id]?.labels?.en?.value ?? '(not found)';
  const same = actual.toLowerCase() === label.toLowerCase();
  idsOk &&= same;
  out(`  ${id} expected "${label}", Wikidata says "${actual}" ${same ? 'OK' : 'MISMATCH'}`);
}
if (!idsOk) {
  out('Fix WIKIDATA_CLASSES in src/services/judgeService.js before trusting the results below.');
}

const samples = JSON.parse(
  await readFile(path.join(here, '..', 'tests', 'fixtures', 'judge-samples.json'), 'utf8'),
);
const delay = Number(process.argv.find((a) => a.startsWith('--delay='))?.split('=')[1] ?? 1200);
const verbose = process.argv.includes('--verbose');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let trace = [];
const judge = createJudgeService({
  env: { ...env, JUDGE_ENABLED: true },
  debug: (event) => trace.push(event),
});

/** Asks the service, waiting and trying again when the source is busy (rate limited or timing out). */
async function ask(category, word) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await judge.check(category, word);
    } catch (err) {
      last = err;
      await sleep(3000 * 2 ** attempt);
    }
  }
  throw last;
}

const rows = [];
out(
  `\nStep 2: running the samples, one word every ${delay} ms (about ${Math.round((400 * (delay + 600)) / 60000)} minutes for all 400)`,
);
for (const category of Object.keys(samples)) {
  if (only && only !== category) continue;
  const tally = { correct: 0, wrong: 0, inconclusive: 0, errors: 0 };
  const reasons = {};
  const wrongWords = [];
  for (const { word, expected } of samples[category]) {
    trace = [];
    let note = '';
    try {
      const { result } = await ask(category, word);
      if (result === 'inconclusive') {
        tally.inconclusive += 1;
        note = `inconclusive (expected ${expected})`;
      } else if (result === expected) tally.correct += 1;
      else {
        tally.wrong += 1;
        wrongWords.push(`${word} (expected ${expected})`);
        note = `WRONG: judged ${result}, expected ${expected}`;
      }
    } catch (err) {
      tally.errors += 1;
      reasons[err.reason ?? 'unknown'] = (reasons[err.reason ?? 'unknown'] ?? 0) + 1;
      note = `ERROR: ${err.reason ?? 'unknown'}`;
    }
    if (verbose && note) {
      out(`  [${category}] ${word}: ${note}`);
      for (const event of trace) out(`      ${JSON.stringify(event).slice(0, 260)}`);
    }
    await sleep(delay);
  }
  const definitive = tally.correct + tally.wrong;
  rows.push({
    category,
    total: samples[category].length,
    ...tally,
    reasons,
    accuracy: definitive ? ((100 * tally.correct) / definitive).toFixed(1) : 'n/a',
    wrongRate: ((100 * tally.wrong) / samples[category].length).toFixed(1),
    wrongWords,
  });
  out(`  ${category} done`);
}

out('\nResults (target: accuracy 90% or more on definitive results, under 5% definitively wrong)');
out(
  '\nCopy the lines below over the empty rows (lines 22 to 25) of the table in docs/JUDGE_RESULTS.md:\n',
);
for (const r of rows) {
  const cells = [
    r.category,
    r.total,
    r.correct,
    r.wrong,
    r.inconclusive,
    r.errors,
    r.accuracy,
    r.wrongRate,
  ];
  out(`| ${cells.join(' | ')} |`);
}
out(
  '\nWords judged wrong, and why any lookups failed (put these on the "Notes after the run" line, line 27):',
);
for (const r of rows) {
  out(
    `  ${r.category}: wrong = ${r.wrongWords.length ? r.wrongWords.join(', ') : 'none'}; errors = ${Object.keys(r.reasons).length ? JSON.stringify(r.reasons) : 'none'}`,
  );
}
out(
  '\nTip: add --verbose to see every word that was wrong, inconclusive or failed, with the requests behind it. Example: npm run judge:evaluate -- --category=place --verbose',
);
