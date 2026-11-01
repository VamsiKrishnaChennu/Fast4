import { LETTER_POOL } from '@fastfour/shared';
import { pickLetter } from '../../src/services/letterService.js';

describe('pickLetter', () => {
  test('never returns a letter outside the pool (10,000 draws)', () => {
    for (let i = 0; i < 10_000; i += 1) expect(LETTER_POOL).toContain(pickLetter([]));
  });

  test('the pool has 21 letters and none of Q U V X Z', () => {
    expect(LETTER_POOL).toHaveLength(21);
    for (const l of 'QUVXZ') expect(LETTER_POOL).not.toContain(l);
  });

  test('never repeats within one game for 20 draws', () => {
    for (let game = 0; game < 200; game += 1) {
      const used = [];
      for (let i = 0; i < 20; i += 1) used.push(pickLetter(used));
      expect(new Set(used).size).toBe(20);
    }
  });

  test('every letter appears about equally often (21,000 draws, loose bounds)', () => {
    const counts = Object.fromEntries(LETTER_POOL.map((l) => [l, 0]));
    for (let i = 0; i < 21_000; i += 1) counts[pickLetter([])] += 1;
    for (const l of LETTER_POOL) {
      expect(counts[l]).toBeGreaterThan(800);
      expect(counts[l]).toBeLessThan(1200);
    }
  });

  test('the last remaining letter is returned, even with a random value of almost 1', () => {
    const used = LETTER_POOL.slice(0, 20);
    expect(pickLetter(used, () => 0.999999)).toBe(LETTER_POOL[20]);
  });

  test('used letters are matched ignoring case', () => {
    const used = LETTER_POOL.slice(1).map((l) => l.toLowerCase());
    expect(pickLetter(used)).toBe(LETTER_POOL[0]);
  });

  test('throws when every letter is used', () => {
    expect(() => pickLetter(LETTER_POOL)).toThrow(/No letters left/);
  });
});
