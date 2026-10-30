import { LETTER_POOL, LIMITS, SCORING, CATEGORIES } from '../index.js';

describe('shared constants', () => {
  test('letter pool has 21 unique letters and excludes Q U V X Z', () => {
    expect(LETTER_POOL).toHaveLength(21);
    expect(new Set(LETTER_POOL).size).toBe(21);
    for (const bad of ['Q', 'U', 'V', 'X', 'Z']) expect(LETTER_POOL).not.toContain(bad);
  });

  test('a 20-round game can always be completed without repeating letters', () => {
    expect(LETTER_POOL.length).toBeGreaterThanOrEqual(LIMITS.ROUNDS_MAX);
  });

  test('round length is a fixed 60 seconds', () => {
    expect(LIMITS.ROUND_SECONDS).toBe(60);
  });

  test('scoring values match the spec', () => {
    expect(SCORING).toMatchObject({ UNIQUE: 10, SHARED: 5, INVALID: 0, FIRST_FINISHER_BONUS: 5 });
    expect(CATEGORIES).toEqual(['name', 'place', 'animal', 'thing']);
  });
});
