import { LIMITS } from './constants.js';

const IES = 'ies';

/**
 * Cleans a typed answer: NFKC, trimmed, single spaces, lower case, only a-z, space, hyphen and apostrophe.
 * @param {unknown} raw
 * @returns {string} the normalized answer ('' for anything that is not a string)
 */
export function normalizeAnswer(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z '-]/g, '')
    .trim()
    .replace(/-{2,}/g, '-')
    .replace(/ {2,}/g, ' ');
}

/** Removes a leading "the " (used for places only). */
const stripThe = (text) => (text.startsWith('the ') ? text.slice(4) : text);

/**
 * Checks the round rules that need no dictionary.
 * @param {string} normalized output of normalizeAnswer
 * @param {string} letter the round letter, upper or lower case
 * @param {string} category name, place, animal or thing
 * @returns {{ result: 'ok' | 'blank' | 'invalid', reason?: 'too_short' | 'too_long' | 'wrong_letter' | 'no_letters' | 'just_letter' }}
 */
export function formatCheck(normalized, letter, category) {
  if (!normalized) return { result: 'blank' };
  if (normalized.length < LIMITS.ANSWER_MIN) return { result: 'invalid', reason: 'too_short' };
  if (normalized.length > LIMITS.ANSWER_MAX) return { result: 'invalid', reason: 'too_long' };
  const lead = category === 'place' ? stripThe(normalized) : normalized;
  const wanted = String(letter).toLowerCase();
  if (lead[0] !== wanted) return { result: 'invalid', reason: 'wrong_letter' };
  if (!/[a-z]/.test(lead)) return { result: 'invalid', reason: 'no_letters' };
  if (lead === wanted) return { result: 'invalid', reason: 'just_letter' };
  return { result: 'ok' };
}

/**
 * Folds one simple plural form of a single word. Words of three letters or fewer keep their final s
 * (bus, gas, yes).
 * @param {string} word
 * @returns {string}
 */
function foldWord(word) {
  let out = word;
  if (word.length > 3 && word.endsWith(IES)) out = `${word.slice(0, -3)}y`;
  else if (/(s|x|z|ch|sh)es$/.test(word) && word.length > 4) out = word.slice(0, -2);
  else if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) out = word.slice(0, -1);
  return out.length >= 2 ? out : word;
}

/**
 * Key used ONLY to decide whether two answers are the same. Ignores case, spaces, hyphens,
 * apostrophes, a leading "the" (places) and a simple plural on the last word.
 * @param {string} normalized
 * @param {string} category
 * @returns {string}
 */
export function matchKey(normalized, category) {
  const text = (category === 'place' ? stripThe(normalized) : normalized).replace(/'/g, '');
  const words = text.replace(/-/g, ' ').split(' ').filter(Boolean);
  if (words.length === 0) return '';
  words[words.length - 1] = foldWord(words[words.length - 1]);
  return words.join('');
}

/**
 * Spellings to try in the dictionary for a typed answer: the answer itself plus the singular forms of
 * its last word, so "tigers" finds "tiger" and "horses" finds "horse". The leading "the" is also dropped for
 * places.
 * @param {string} normalized
 * @param {string} category
 * @returns {string[]} unique candidates, the typed form first
 */
export function lookupCandidates(normalized, category) {
  const base = category === 'place' ? stripThe(normalized) : normalized;
  const parts = base.split(/([ -])/);
  const last = parts.pop();
  const head = parts.join('');
  const forms = new Set([last]);
  if (last.length > 3 && last.endsWith(IES)) forms.add(`${last.slice(0, -3)}y`);
  if (last.length > 3 && last.endsWith('es')) forms.add(last.slice(0, -2));
  if (last.length > 3 && last.endsWith('s') && !last.endsWith('ss')) forms.add(last.slice(0, -1));
  const out = [...forms].map((form) => `${head}${form}`);
  return [...new Set([normalized, ...out])];
}
