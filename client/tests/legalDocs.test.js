import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, test } from 'vitest';
import { privacy } from '../src/legal/privacy.js';
import { terms } from '../src/legal/terms.js';
import { legalToMarkdown } from '../src/legal/toMarkdown.js';

const docPath = (name) => resolve(import.meta.dirname, '..', '..', 'docs', 'legal', name);
const CONTACT = 'creatiquework@gmail.com';
// The docs are formatted by Prettier (like every file in the repo), so compare after the same step.
async function formatted(markdown) {
  const config = await resolveConfig(docPath('privacy.md'));
  return format(markdown, { ...config, parser: 'markdown' });
}
const file = (name) => readFileSync(docPath(name), 'utf8');

describe('docs/legal matches the pages the app shows', () => {
  test('privacy.md is up to date (run `npm run docs:legal` after editing the text)', async () => {
    expect(file('privacy.md')).toBe(await formatted(legalToMarkdown(privacy({ email: CONTACT }))));
  });
  test('terms.md is up to date', async () => {
    expect(file('terms.md')).toBe(await formatted(legalToMarkdown(terms({ email: CONTACT }))));
  });
  test('the policy covers what Google Play and the app require', () => {
    const text = legalToMarkdown(privacy({ email: CONTACT }));
    for (const needle of ['13', 'delete-account', '7 days', '14 days', '30 days', CONTACT]) {
      expect(text).toContain(needle);
    }
  });
});
