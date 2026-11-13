import { LIMITS } from '@fastfour/shared';

/**
 * Timings for group games. In production these are always the real ones. End-to-end tests
 * (NODE_ENV test with TEST_ROUND_SECONDS) get short rounds and short pauses between phases.
 * @param {{ ROUND_SECONDS: number, LETTER_REVEAL_MS: number }} env
 */
export function gameTiming(env) {
  const timing = { roundMs: env.ROUND_SECONDS * 1000, revealMs: env.LETTER_REVEAL_MS };
  if (env.ROUND_SECONDS !== LIMITS.ROUND_SECONDS) {
    Object.assign(timing, {
      startingMs: 500,
      graceMs: 300,
      reviewMs: 5000,
      resultMs: 2500,
      aloneMs: 4000,
    });
  }
  return timing;
}
