import { createProfanityCheck } from '../../scripts/lib/profanity.js';

describe('createProfanityCheck', () => {
  const isProfane = createProfanityCheck();

  test('catches listed words as whole words, in any case and inside hyphenated words', () => {
    expect(isProfane('shit')).toBe(true);
    expect(isProfane('Holy Shit')).toBe(true);
    expect(isProfane('what-the-fuck')).toBe(true);
  });

  test('does not flag ordinary words that only contain a listed word', () => {
    for (const word of [
      'classic',
      'assam',
      'scunthorpe',
      'cocktail',
      'tiger',
      'new york',
      'brass monkey',
      'magnus hitch',
    ]) {
      expect(isProfane(word)).toBe(false);
    }
  });

  test('catches listed phrases', () => {
    expect(isProfane('blow job')).toBe(true);
  });
});
