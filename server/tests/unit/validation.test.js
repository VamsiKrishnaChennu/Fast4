import { jest } from '@jest/globals';
import { createValidationService } from '../../src/services/validationService.js';
import { fixtureDictionary } from '../helpers/fixtures.js';

const make = () => {
  const dict = fixtureDictionary();
  const has = jest.fn(dict.has);
  return { has, service: createValidationService({ dictionary: { has } }) };
};

describe('validateAnswer', () => {
  test.each([
    ['apple', 'A', 'thing'],
    ['Tigers', 'T', 'animal'],
    ['  CAT ', 'C', 'animal'],
    ['Foxes', 'F', 'animal'],
    ['Horses', 'H', 'animal'],
    ['Ice Cream', 'I', 'thing'],
    ['ice-cream', 'I', 'thing'],
    ['The Netherlands', 'N', 'place'],
    ['New York', 'N', 'place'],
    ["O'Brien", 'O', 'name'],
    ['Cities', 'C', 'place'],
    ['Glasses', 'G', 'thing'],
  ])('%s is valid for %s %s', (raw, letter, category) => {
    const { service } = make();
    const result = service.validateAnswer({ raw, letter, category });
    expect(result.verdict).toBe('valid');
    expect(result.verdictSource).toBe('dictionary');
    expect(result.matchKey).toEqual(expect.any(String));
  });

  test('a word that is not in the dictionary is invalid with source dictionary', () => {
    const { service } = make();
    expect(service.validateAnswer({ raw: 'Zorp', letter: 'Z', category: 'thing' })).toMatchObject({
      verdict: 'invalid',
      verdictSource: 'dictionary',
      reason: 'not_in_dictionary',
    });
  });

  test('the wrong first letter is a rule failure and the dictionary is never asked', () => {
    const { service, has } = make();
    const result = service.validateAnswer({ raw: 'banana', letter: 'A', category: 'thing' });
    expect(result).toMatchObject({
      verdict: 'invalid',
      verdictSource: 'rule',
      reason: 'wrong_letter',
    });
    expect(has).not.toHaveBeenCalled();
  });

  test.each([
    ['', 'blank'],
    ['   ', 'blank'],
    [null, 'blank'],
    [undefined, 'blank'],
    [123, 'blank'],
  ])('%j is blank and the dictionary is never asked', (raw) => {
    const { service, has } = make();
    expect(service.validateAnswer({ raw, letter: 'A', category: 'thing' })).toEqual({
      raw,
      normalized: '',
      verdict: 'blank',
    });
    expect(has).not.toHaveBeenCalled();
  });

  test('too short and too long are rule failures', () => {
    const { service } = make();
    expect(service.validateAnswer({ raw: 'a', letter: 'A', category: 'thing' }).reason).toBe(
      'too_short',
    );
    expect(
      service.validateAnswer({ raw: 'a'.repeat(31), letter: 'A', category: 'thing' }).reason,
    ).toBe('too_long');
  });

  test('a place typed as an animal is invalid', () => {
    const { service } = make();
    expect(service.validateAnswer({ raw: 'paris', letter: 'P', category: 'animal' }).verdict).toBe(
      'invalid',
    );
  });

  test('case and spacing variants share a match key', () => {
    const { service } = make();
    const a = service.validateAnswer({ raw: 'ICE  cream', letter: 'I', category: 'thing' });
    const b = service.validateAnswer({ raw: 'ice-cream', letter: 'I', category: 'thing' });
    expect(a.matchKey).toBe(b.matchKey);
    const cat = service.validateAnswer({ raw: 'Cat', letter: 'C', category: 'animal' });
    const cats = service.validateAnswer({ raw: 'cats', letter: 'C', category: 'animal' });
    expect(cat.matchKey).toBe(cats.matchKey);
  });
});

describe('validateAnswers', () => {
  test('judges all four categories and treats missing ones as blank', () => {
    const { service } = make();
    const result = service.validateAnswers({ name: 'Chris', place: 'Canada', animal: 'Cat' }, 'C');
    expect(result.name.verdict).toBe('valid');
    expect(result.place.verdict).toBe('valid');
    expect(result.animal.verdict).toBe('valid');
    expect(result.thing.verdict).toBe('blank');
  });

  test('handles a missing answers object', () => {
    const { service } = make();
    expect(service.validateAnswers(undefined, 'C').name.verdict).toBe('blank');
  });
});

describe('speed', () => {
  test('10,000 validations take well under 200 ms', () => {
    const { service } = make();
    const start = performance.now();
    for (let i = 0; i < 10_000; i += 1) {
      service.validateAnswer({
        raw: i % 2 ? 'Tigers' : 'Zorp',
        letter: i % 2 ? 'T' : 'Z',
        category: 'animal',
      });
    }
    expect(performance.now() - start).toBeLessThan(200);
  });
});
