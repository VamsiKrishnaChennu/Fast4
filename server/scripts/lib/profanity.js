import { Filter } from 'bad-words';

/**
 * A fast profanity check for normalized words (letters, spaces, hyphens and apostrophes only).
 * It uses the same list as the bad-words package, but compares whole words with a Set instead of
 * running hundreds of patterns per word, which matters for lists of 200,000 entries.
 * @returns {(text: string) => boolean} true when the text contains a listed word or phrase
 */
export function createProfanityCheck() {
  const list = new Filter().list.map((w) => w.toLowerCase());
  const words = new Set(list.filter((w) => /^[a-z]+$/.test(w)));
  const phrases = list.filter((w) => /^[a-z]+(?: [a-z]+)+$/.test(w));
  return (text) => {
    const lower = text.toLowerCase().replace(/[-']/g, ' ');
    if (lower.split(' ').some((token) => words.has(token))) return true;
    const padded = ` ${lower} `;
    return phrases.some((phrase) => padded.includes(` ${phrase} `));
  };
}
