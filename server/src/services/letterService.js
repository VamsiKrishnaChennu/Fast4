import { LETTER_POOL } from '@fastfour/shared';

/**
 * Picks the next round letter: random, from the pool, never one already used in this game.
 * @param {string[]} [used] letters already played
 * @param {() => number} [random] returns a number in [0, 1); injectable for tests
 * @returns {string} an uppercase letter
 * @throws {Error} when every letter has been used (cannot happen within 20 rounds)
 */
export function pickLetter(used = [], random = Math.random) {
  const taken = new Set(used.map((l) => l.toUpperCase()));
  const available = LETTER_POOL.filter((l) => !taken.has(l));
  if (available.length === 0) throw new Error('No letters left in the pool.');
  return available[Math.min(available.length - 1, Math.floor(random() * available.length))];
}
