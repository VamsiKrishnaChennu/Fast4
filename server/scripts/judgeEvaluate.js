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
const judge = createJudgeService({ env: { ...env, JUDGE_ENABLED: true } });
const rows = [];

out('\nStep 2: running the samples (this takes a few minutes)');
for (const category of Object.keys(samples)) {
  if (only && only !== category) continue;
  const tally = { correct: 0, wrong: 0, inconclusive: 0, errors: 0 };
  const wrongWords = [];
  for (const { word, expected } of samples[category]) {
    try {
      const { result } = await judge.check(category, word);
      if (result === 'inconclusive') tally.inconclusive += 1;
      else if (result === expected) tally.correct += 1;
      else {
        tally.wrong += 1;
        wrongWords.push(`${word} (expected ${expected})`);
      }
    } catch {
      tally.errors += 1;
    }
  }
  const definitive = tally.correct + tally.wrong;
  rows.push({
    category,
    total: samples[category].length,
    ...tally,
    accuracy: definitive ? ((100 * tally.correct) / definitive).toFixed(1) : 'n/a',
    wrongRate: ((100 * tally.wrong) / samples[category].length).toFixed(1),
    wrongWords,
  });
}

out('\nResults (target: accuracy 90% or more on definitive results, under 5% definitively wrong)');
out('category | words | correct | wrong | inconclusive | errors | accuracy % | wrong % of all');
for (const r of rows) {
  out(
    `${r.category} | ${r.total} | ${r.correct} | ${r.wrong} | ${r.inconclusive} | ${r.errors} | ${r.accuracy} | ${r.wrongRate}`,
  );
  if (r.wrongWords.length) out(`  wrong: ${r.wrongWords.join(', ')}`);
}
out('\nCopy this table into docs/JUDGE_RESULTS.md.');
