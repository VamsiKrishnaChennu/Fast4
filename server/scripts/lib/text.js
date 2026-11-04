import { normalizeAnswer } from '@fastfour/shared';

/** Letters that do not split into a base letter plus an accent. */
const SPECIAL = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ł: 'l',
  ı: 'i',
  ħ: 'h',
};

/**
 * Turns accented Latin letters into plain ones ("Ümit" becomes "Umit", "Zoë" becomes "Zoe") and
 * unifies curly apostrophes and long dashes. Letters of other scripts are left alone.
 * @param {string} text
 * @returns {string}
 */
export function foldAccents(text) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[ßæœøđðþłıħ]/gi, (c) => SPECIAL[c.toLowerCase()])
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[‐-―]/g, '-');
}

/** Five letters in a row with no vowel, or the same letter three times, do not occur in real place names. */
const IMPLAUSIBLE = /[^aeiouy' .-]{5,}|(.)\1\1/;

/**
 * Cleans one raw label from a source into a dictionary word, or says why it was rejected.
 * @param {string} raw
 * @param {{ minLetters?: number, plausible?: boolean, isProfane?: (text: string) => boolean }} [options]
 * @returns {{ word: string } | { reason: 'script' | 'symbols' | 'start' | 'short' | 'long' | 'implausible' | 'profane' }}
 */
export function cleanWord(raw, { minLetters = 2, plausible = false, isProfane } = {}) {
  const folded = foldAccents(String(raw)).trim();
  if (/[^ -~]/.test(folded)) return { reason: 'script' };
  if (/[0-9()[\]{}/\\@#$%&*+=<>|_~^:;!?",]/.test(folded)) return { reason: 'symbols' };
  if (!/^[A-Za-z]/.test(folded)) return { reason: 'start' };
  const word = normalizeAnswer(folded);
  if (word.replace(/[^a-z]/g, '').length < minLetters) return { reason: 'short' };
  if (word.length > 30) return { reason: 'long' };
  if (plausible && IMPLAUSIBLE.test(word)) return { reason: 'implausible' };
  if (isProfane?.(word)) return { reason: 'profane' };
  return { word };
}

/**
 * Cleans a whole list.
 * @param {Iterable<string>} list
 * @param {Parameters<typeof cleanWord>[1]} [options]
 * @returns {{ words: Set<string>, fetched: number, rejects: Record<string, number>, profane: string[] }}
 *   profane lists the entries the profanity filter removed, so they can be reviewed
 */
export function cleanWords(list, options) {
  const words = new Set();
  const rejects = {};
  const profane = [];
  let fetched = 0;
  for (const raw of list) {
    fetched += 1;
    const result = cleanWord(raw, options);
    if ('word' in result) words.add(result.word);
    else {
      rejects[result.reason] = (rejects[result.reason] ?? 0) + 1;
      if (result.reason === 'profane') profane.push(String(raw));
    }
  }
  return { words, fetched, rejects, profane };
}
