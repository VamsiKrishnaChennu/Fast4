import {
  dictionaryKey,
  formatCheck,
  lookupCandidates,
  matchKey,
  normalizeAnswer,
} from '../index.js';

describe('normalizeAnswer', () => {
  test.each([
    ['  Apple  ', 'apple'],
    ['New   York', 'new york'],
    ["O'Brien", "o'brien"],
    ['ice-cream', 'ice-cream'],
    ['CAT123', 'cat'],
    ['café', 'caf'],
    ['<b>bear</b>', 'bbearb'],
    ['ice--cream', 'ice-cream'],
    ['  - ', '-'],
    ['\u{1F600}\u{1F600}', ''],
    ['Ａpple', 'apple'],
    ['', ''],
  ])('%j becomes %j', (input, expected) => {
    expect(normalizeAnswer(input)).toBe(expected);
  });

  test.each([[null], [undefined], [42], [{}], [[]]])('%p gives an empty string', (input) => {
    expect(normalizeAnswer(input)).toBe('');
  });

  test('a very long answer normalizes without error', () => {
    expect(normalizeAnswer('a'.repeat(500))).toHaveLength(500);
  });
});

describe('formatCheck', () => {
  const ok = { result: 'ok' };
  test.each([
    ['', 'A', 'thing', { result: 'blank' }],
    ['a', 'A', 'thing', { result: 'invalid', reason: 'too_short' }],
    ['apple', 'A', 'thing', ok],
    ['apple', 'a', 'thing', ok],
    ['banana', 'A', 'thing', { result: 'invalid', reason: 'wrong_letter' }],
    ['the netherlands', 'N', 'place', ok],
    ['the cat', 'T', 'thing', ok],
    ['the cat', 'C', 'animal', { result: 'invalid', reason: 'wrong_letter' }],
    ['z'.repeat(31), 'Z', 'animal', { result: 'invalid', reason: 'too_long' }],
    ['--', 'A', 'thing', { result: 'invalid', reason: 'wrong_letter' }],
    ['--', '-', 'thing', { result: 'invalid', reason: 'no_letters' }],
    ['the a', 'A', 'place', { result: 'invalid', reason: 'just_letter' }],
    ['a'.repeat(30), 'A', 'thing', ok],
  ])('%j with letter %s as %s', (text, letter, category, expected) => {
    expect(formatCheck(text, letter, category)).toEqual(expected);
  });
});

describe('matchKey', () => {
  test.each([
    ['cat', 'cats', 'animal', true],
    ['fox', 'foxes', 'animal', true],
    ['city', 'cities', 'place', true],
    ['glass', 'glasses', 'thing', true],
    ['glass', 'glas', 'thing', false],
    ['ice cream', 'ice-cream', 'thing', true],
    ['the hague', 'hague', 'place', true],
    ['bus', 'bus', 'thing', true],
    ['bus', 'buses', 'thing', true],
    ['ant', 'apple', 'thing', false],
    ["o'brien", 'obrien', 'name', true],
    ['sam', 'sams', 'name', true],
    ['ice cream', 'ice creams', 'thing', true],
    ['gas', 'gas', 'thing', true],
  ])('%s and %s (%s) same key: %s', (a, b, category, same) => {
    expect(matchKey(a, category) === matchKey(b, category)).toBe(same);
  });

  test('empty text gives an empty key and single letters are kept', () => {
    expect(matchKey('', 'thing')).toBe('');
    expect(matchKey('s', 'thing')).toBe('s');
    expect(matchKey('is', 'thing')).toBe('is');
  });

  test('only the last word is folded', () => {
    expect(matchKey('cats cradle', 'thing')).toBe('catscradle');
  });
});

describe('lookupCandidates', () => {
  test('tries the typed form first, then singular forms', () => {
    expect(lookupCandidates('tigers', 'animal')).toEqual(['tigers', 'tiger']);
    expect(lookupCandidates('horses', 'animal')).toEqual(['horses', 'hors', 'horse']);
    expect(lookupCandidates('cities', 'place')).toEqual(['cities', 'city', 'citi', 'citie']);
    expect(lookupCandidates('glasses', 'thing')).toEqual(['glasses', 'glass', 'glasse']);
  });

  test('works on the last word and keeps spaces and hyphens', () => {
    expect(lookupCandidates('ice creams', 'thing')).toEqual(['ice creams', 'ice cream']);
    expect(lookupCandidates('ice-creams', 'thing')).toContain('ice-cream');
  });

  test('leaves short words and words that do not end in s alone', () => {
    expect(lookupCandidates('bus', 'thing')).toEqual(['bus']);
    expect(lookupCandidates('apple', 'thing')).toEqual(['apple']);
  });

  test('places also try without a leading the', () => {
    expect(lookupCandidates('the netherlands', 'place')).toEqual([
      'the netherlands',
      'netherlands',
      'netherland',
    ]);
  });
});

describe('dictionaryKey', () => {
  test.each([
    ['tamil nadu', 'tamilnadu'],
    ['tamilnadu', 'tamilnadu'],
    ['ice cream', 'icecream'],
    ['ice-cream', 'icecream'],
    ['icecream', 'icecream'],
    ["o'brien", 'obrien'],
    ['  a - b ', 'ab'],
    ['', ''],
  ])('%j becomes %j', (input, expected) => {
    expect(dictionaryKey(input)).toBe(expected);
  });

  test('spellings that differ only by spaces, hyphens or apostrophes share a key', () => {
    const keys = new Set(['new york', 'new-york', 'newyork'].map(dictionaryKey));
    expect(keys.size).toBe(1);
  });

  test('plural forms found by lookupCandidates still reach the key of the singular', () => {
    const keys = lookupCandidates('icecreams', 'thing').map(dictionaryKey);
    expect(keys).toContain(dictionaryKey('ice cream'));
    expect(lookupCandidates('ice creams', 'thing').map(dictionaryKey)).toContain('icecream');
  });
});
