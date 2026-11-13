import { Filter } from 'bad-words';

const filter = new Filter();

/** True when the text contains a word the filter knows. */
export const isProfane = (text) => filter.isProfane(text);

/** Replaces every bad word with asterisks of the same length. Never throws. */
export function maskProfanity(text) {
  try {
    return filter.clean(text);
  } catch {
    // bad-words throws on text with only punctuation; such text has nothing to mask.
    return text;
  }
}
