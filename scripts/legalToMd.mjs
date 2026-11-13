/* eslint-disable no-console */
/* Writes docs/legal/privacy.md and terms.md from the same text the app shows (client/src/legal).
   Run: npm run docs:legal */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { legalToMarkdown } from '../client/src/legal/toMarkdown.js';
import { privacy } from '../client/src/legal/privacy.js';
import { terms } from '../client/src/legal/terms.js';

export const CONTACT = 'creatiquework@gmail.com';
const out = fileURLToPath(new URL('../docs/legal/', import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(`${out}privacy.md`, legalToMarkdown(privacy({ email: CONTACT })));
writeFileSync(`${out}terms.md`, legalToMarkdown(terms({ email: CONTACT })));
console.log('docs/legal/privacy.md and terms.md written');
