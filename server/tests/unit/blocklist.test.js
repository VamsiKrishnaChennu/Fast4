import { parseBlocklist } from '../../scripts/lib/blocklist.js';

describe('parseBlocklist', () => {
  test('reads category and word, ignoring notes and blank lines', () => {
    const blocked = parseBlocklist('# note\n\nanimal: Animal\nthing:  thing \nplace: new: york\n');
    expect([...blocked.animal]).toEqual(['animal']);
    expect([...blocked.thing]).toEqual(['thing']);
    expect([...blocked.place]).toEqual(['new: york']);
    expect(blocked.name.size).toBe(0);
  });

  test('a bad line stops the build with a clear message', () => {
    expect(() => parseBlocklist('colour: red')).toThrow(/Bad line in blocked.txt/);
    expect(() => parseBlocklist('animal:')).toThrow(/Bad line/);
  });
});
