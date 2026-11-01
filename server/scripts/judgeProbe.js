/* Shows exactly what Wikidata and the Free Dictionary API say about one word. Needs internet.
   Usage: npm run judge:probe -- thing window */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, loadEnvFile } from '../src/config/env.js';
import { createJudgeService } from '../src/services/judgeService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(here, '..', '.env'));
const env = loadEnv();
const out = (text = '') => process.stdout.write(`${text}\n`);
const [category, word] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!['name', 'place', 'animal', 'thing'].includes(category) || !word) {
  out('Usage: npm run judge:probe -- <name|place|animal|thing> <word>');
  process.exit(1);
}

if (category === 'thing' || category === 'animal') {
  const url = `${env.DICTIONARY_API_URL.replace(/\/$/, '')}/${encodeURIComponent(word)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': env.WIKIDATA_USER_AGENT ?? 'FastFour/1.0' },
  });
  const text = await response.text();
  out(`Dictionary API: HTTP ${response.status}`);
  out(text.slice(0, 600));
  out('');
}

const judge = createJudgeService({
  env,
  debug: (event) => out(`  trace ${JSON.stringify(event).slice(0, 300)}`),
});
try {
  out(`Verdict: ${JSON.stringify(await judge.check(category, word.toLowerCase()))}`);
} catch (err) {
  out(`Could not check: ${err.reason ?? err.message}`);
}
