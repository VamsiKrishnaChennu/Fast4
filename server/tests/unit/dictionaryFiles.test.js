import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dictionaryKey, LETTER_POOL, normalizeAnswer } from '@fastfour/shared';
import { createProfanityCheck } from '../../scripts/lib/profanity.js';
import { createValidationService } from '../../src/services/validationService.js';

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'dictionary',
);
const FILES = {
  name: 'names.txt',
  place: 'places.txt',
  animal: 'animals.txt',
  thing: 'things.txt',
};
const words = Object.fromEntries(
  Object.entries(FILES).map(([c, f]) => [
    c,
    readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean),
  ]),
);
const sets = Object.fromEntries(
  Object.entries(words).map(([c, list]) => [c, new Set(list.map(dictionaryKey))]),
);
const dictionary = { has: (category, word) => sets[category].has(dictionaryKey(word)) };
const service = createValidationService({ dictionary });

describe('the committed word lists', () => {
  test.each([
    ['name', 5000],
    ['animal', 1500],
    ['thing', 10000],
    ['place', 1000],
  ])('%s list has at least %i words', (category, minimum) => {
    expect(words[category].length).toBeGreaterThanOrEqual(minimum);
  });

  test.each(Object.keys(FILES))('%s lines are normalized, unique and sorted', (category) => {
    const list = words[category];
    expect(list.every((w) => normalizeAnswer(w) === w && w.length >= 2 && w.length <= 30)).toBe(
      true,
    );
    expect(new Set(list).size).toBe(list.length);
    expect([...list].sort()).toEqual(list);
  });

  test.each(Object.keys(FILES))('%s list has no profanity', (category) => {
    const isProfane = createProfanityCheck();
    expect(words[category].filter((w) => isProfane(w))).toEqual([]);
  });

  test.each(Object.keys(FILES))('%s list has words for every playable letter', (category) => {
    for (const letter of LETTER_POOL) {
      const count = words[category].filter((w) => w.startsWith(letter.toLowerCase())).length;
      expect(count).toBeGreaterThanOrEqual(10);
    }
  });

  test('everyday words are accepted', () => {
    const cases = [
      ['apple', 'A', 'thing'],
      ['Table', 'T', 'thing'],
      ['Tiger', 'T', 'animal'],
      ['Tigers', 'T', 'animal'],
      ['Horses', 'H', 'animal'],
      ['Canada', 'C', 'place'],
      ['Sirsi', 'S', 'place'],
      ['The Netherlands', 'N', 'place'],
      ['Priya', 'P', 'name'],
      ['Sam', 'S', 'name'],
      // The cases from the bug report, and words that exist in more than one list.
      ['Tulasi', 'T', 'name'],
      ['Tamilnadu', 'T', 'place'],
      ['Tamil Nadu', 'T', 'place'],
      ['Tiger', 'T', 'animal'],
      ['Tape', 'T', 'thing'],
      ['Kite', 'K', 'thing'],
      ['Kite', 'K', 'animal'],
      ['Mouse', 'M', 'thing'],
      ['Bengal tiger', 'B', 'animal'],
      ['Dupatta', 'D', 'thing'],
    ];
    for (const [raw, letter, category] of cases) {
      expect(service.validateAnswer({ raw, letter, category }).verdict).toBe('valid');
    }
  });

  test('nonsense, other categories and wrong letters are rejected', () => {
    expect(
      service.validateAnswer({ raw: 'Blorptown', letter: 'B', category: 'place' }).verdict,
    ).toBe('invalid');
    expect(service.validateAnswer({ raw: 'Table', letter: 'T', category: 'animal' }).verdict).toBe(
      'invalid',
    );
    expect(
      service.validateAnswer({ raw: 'Banana', letter: 'T', category: 'thing' }).verdictSource,
    ).toBe('rule');
  });

  test('10,000 validations against the full lists take under 200 ms', () => {
    const pool = [
      'Tigers',
      'Zorp',
      'Table',
      'Tamil Nadu',
      'Tara',
      'Tomato',
      'Tx',
      'Tulip',
      'Turtle',
      'Taiwan',
    ];
    const categories = [
      'animal',
      'thing',
      'thing',
      'place',
      'name',
      'thing',
      'thing',
      'thing',
      'animal',
      'place',
    ];
    const start = performance.now();
    for (let i = 0; i < 10_000; i += 1) {
      service.validateAnswer({ raw: pool[i % 10], letter: 'T', category: categories[i % 10] });
    }
    expect(performance.now() - start).toBeLessThan(200);
  });
});
