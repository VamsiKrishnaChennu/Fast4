import {
  CATEGORIES,
  formatCheck,
  lookupCandidates,
  matchKey,
  normalizeAnswer,
} from '@fastfour/shared';

/**
 * Judges answers with the format rules and the local dictionary. No outside service is called.
 * @param {{ dictionary: { has: (category: string, word: string) => boolean } }} deps
 */
export function createValidationService({ dictionary }) {
  /**
   * @param {{ raw: unknown, letter: string, category: string }} input
   * @returns {{ raw: unknown, normalized: string, verdict: 'valid' | 'invalid' | 'blank', verdictSource?: 'rule' | 'dictionary', reason?: string, matchKey?: string }}
   */
  function validateAnswer({ raw, letter, category }) {
    const normalized = normalizeAnswer(raw);
    const check = formatCheck(normalized, letter, category);
    if (check.result === 'blank') return { raw, normalized, verdict: 'blank' };
    if (check.result === 'invalid') {
      return { raw, normalized, verdict: 'invalid', verdictSource: 'rule', reason: check.reason };
    }
    const found = lookupCandidates(normalized, category).some((word) =>
      dictionary.has(category, word),
    );
    if (!found) {
      return {
        raw,
        normalized,
        verdict: 'invalid',
        verdictSource: 'dictionary',
        reason: 'not_in_dictionary',
      };
    }
    return {
      raw,
      normalized,
      verdict: 'valid',
      verdictSource: 'dictionary',
      matchKey: matchKey(normalized, category),
    };
  }

  /**
   * Judges all four answers of one player for one round.
   * @param {Record<string, unknown>} answers keys name, place, animal, thing
   * @param {string} letter
   * @returns {Record<string, ReturnType<typeof validateAnswer>>}
   */
  function validateAnswers(answers, letter) {
    return Object.fromEntries(
      CATEGORIES.map((category) => [
        category,
        validateAnswer({ raw: answers?.[category], letter, category }),
      ]),
    );
  }

  return { validateAnswer, validateAnswers };
}
