import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { DictionaryEntry } from '../../src/models/DictionaryEntry.js';
import { createDictionaryService } from '../../src/services/dictionaryService.js';
import { parseWordList, seedDictionary } from '../../src/services/dictionarySeeder.js';
import { createValidationService } from '../../src/services/validationService.js';
import { createTestApp } from '../helpers/createTestApp.js';
import { clearDb, startTestDb, stopTestDb } from '../helpers/testDb.js';

beforeAll(startTestDb, 120_000);
afterAll(stopTestDb);
beforeEach(clearDb);

async function makeDir(overrides = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dict-'));
  const files = {
    'names.txt': 'Alex\nAmy\nArjun\n',
    'places.txt': 'Canada\nSpain\nNew York\n',
    'animals.txt': 'Cat\nCow\n',
    'things.txt': 'Cup\nChair\nIce-Cream\n',
    ...overrides,
  };
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(dir, name), text);
  return dir;
}

describe('parseWordList', () => {
  test('normalizes lines and drops empties, one-letter lines and duplicates', () => {
    const list = parseWordList('Alex\r\n\r\n  amy \nALEX\nx\nCafé\n');
    expect(list.map((e) => e.word)).toEqual(['alex', 'amy', 'caf']);
    expect(list[1].displayWord).toBe('amy');
  });
});

describe('seedDictionary', () => {
  test('loads all four files and is safe to run again', async () => {
    const dir = await makeDir();
    const first = await seedDictionary(dir);
    expect(first).toEqual({
      name: { read: 3, added: 3, removed: 0, total: 3 },
      place: { read: 3, added: 3, removed: 0, total: 3 },
      animal: { read: 2, added: 2, removed: 0, total: 2 },
      thing: { read: 3, added: 3, removed: 0, total: 3 },
    });
    const second = await seedDictionary(dir);
    expect(Object.values(second).map((r) => r.added)).toEqual([0, 0, 0, 0]);
    expect(await DictionaryEntry.countDocuments()).toBe(11);
    const stored = await DictionaryEntry.findOne({ category: 'thing', word: 'ice-cream' });
    expect(stored).toMatchObject({ displayWord: 'Ice-Cream', source: 'seed', overturnedCount: 0 });
  });

  test('--replace removes old seed words, keeps appeal words and reports the totals', async () => {
    await seedDictionary(await makeDir());
    await DictionaryEntry.create({ category: 'thing', word: 'sitar', source: 'external' });
    const report = await seedDictionary(
      await makeDir({ 'things.txt': 'Cup\nKettle\n', 'animals.txt': 'Cat\nCow\nCamel\n' }),
      { replace: true },
    );
    expect(report.thing).toEqual({ read: 2, added: 1, removed: 2, total: 3 });
    expect(report.animal).toEqual({ read: 3, added: 1, removed: 0, total: 3 });
    const things = (await DictionaryEntry.find({ category: 'thing' }).lean()).map((e) => e.word);
    expect(things.sort()).toEqual(['cup', 'kettle', 'sitar']);
  });

  test('a plain seed never deletes anything', async () => {
    await seedDictionary(await makeDir());
    const report = await seedDictionary(await makeDir({ 'things.txt': 'Cup\n' }));
    expect(report.thing).toMatchObject({ removed: 0, total: 3 });
  });

  test('--replace refuses to run when a file is empty', async () => {
    await seedDictionary(await makeDir());
    await expect(
      seedDictionary(await makeDir({ 'animals.txt': '' }), { replace: true }),
    ).rejects.toThrow(/would delete the whole animal list/);
    expect(await DictionaryEntry.countDocuments({ category: 'animal' })).toBe(2);
  });

  test('a missing file stops the seed with a clear error', async () => {
    const dir = await makeDir();
    await expect(seedDictionary(path.join(dir, 'nope'))).rejects.toThrow(/ENOENT/);
  });
});

describe('dictionaryService', () => {
  test('loads the database into memory and answers has()', async () => {
    await seedDictionary(await makeDir());
    const dictionary = createDictionaryService();
    expect(dictionary.isReady()).toBe(false);
    await dictionary.init();
    expect(dictionary.isReady()).toBe(true);
    expect(dictionary.has('animal', 'cat')).toBe(true);
    expect(dictionary.has('animal', 'dog')).toBe(false);
    expect(dictionary.has('place', 'new york')).toBe(true);
    expect(dictionary.counts()).toEqual({ name: 3, place: 3, animal: 2, thing: 3 });
  });

  test('is not ready while any category is empty', async () => {
    await seedDictionary(await makeDir({ 'animals.txt': '' }));
    const dictionary = createDictionaryService();
    await dictionary.init();
    expect(dictionary.counts().animal).toBe(0);
    expect(dictionary.isReady()).toBe(false);
  });

  test('add() makes a word valid at once and saves it as external', async () => {
    await seedDictionary(await makeDir());
    const dictionary = createDictionaryService();
    await dictionary.init();
    await dictionary.add('thing', 'sitar', 'Sitar');
    expect(dictionary.has('thing', 'sitar')).toBe(true);
    expect(await DictionaryEntry.findOne({ category: 'thing', word: 'sitar' })).toMatchObject({
      source: 'external',
      displayWord: 'Sitar',
    });
    await dictionary.add('thing', 'sitar');
    expect(await DictionaryEntry.countDocuments({ category: 'thing', word: 'sitar' })).toBe(1);

    const fresh = createDictionaryService();
    await fresh.init();
    expect(fresh.has('thing', 'sitar')).toBe(true);
  });

  test('remove() deletes from memory and the database', async () => {
    await seedDictionary(await makeDir());
    const dictionary = createDictionaryService();
    await dictionary.init();
    await dictionary.remove('thing', 'cup');
    expect(dictionary.has('thing', 'cup')).toBe(false);
    expect(await DictionaryEntry.countDocuments({ category: 'thing', word: 'cup' })).toBe(0);
  });

  test('spaces, hyphens and apostrophes are ignored when looking a word up', async () => {
    await seedDictionary(
      await makeDir({
        'places.txt': "Tamil Nadu\nNew York\nSt John's\n",
        'things.txt': 'Ice Cream\nCup\nChair\n',
      }),
    );
    const dictionary = createDictionaryService();
    await dictionary.init();
    expect(dictionary.has('place', 'tamilnadu')).toBe(true);
    expect(dictionary.has('place', 'tamil nadu')).toBe(true);
    expect(dictionary.has('place', 'tamil-nadu')).toBe(true);
    expect(dictionary.has('place', 'st johns')).toBe(true);
    expect(dictionary.has('thing', 'ice-cream')).toBe(true);
    expect(dictionary.has('thing', 'icecream')).toBe(true);
    expect(dictionary.has('thing', 'ice cream')).toBe(true);
    expect(dictionary.has('thing', 'ice cones')).toBe(false);
    // The stored spelling is unchanged.
    expect(await DictionaryEntry.findOne({ category: 'place', word: 'tamil nadu' })).toMatchObject({
      displayWord: 'Tamil Nadu',
    });
    // Counts are still one per key, and a word stays in its own category.
    expect(dictionary.counts().place).toBe(3);
    expect(dictionary.has('thing', 'tamilnadu')).toBe(false);
  });

  test('plural and no-space spellings together: "icecreams" finds "ice cream"', async () => {
    await seedDictionary(await makeDir());
    const dictionary = createDictionaryService();
    await dictionary.init();
    const validation = createValidationService({ dictionary });
    for (const raw of ['icecreams', 'ice creams', 'Ice-Cream', 'icecream']) {
      expect(validation.validateAnswer({ raw, letter: 'I', category: 'thing' }).verdict).toBe(
        'valid',
      );
    }
  });

  test('add() with a spaced spelling is found without the space, and the other way round', async () => {
    await seedDictionary(await makeDir());
    const dictionary = createDictionaryService();
    await dictionary.init();
    await dictionary.add('place', 'tiruchi rock', 'Tiruchi Rock');
    expect(dictionary.has('place', 'tiruchirock')).toBe(true);
    await dictionary.add('thing', 'pressure-cooker');
    expect(dictionary.has('thing', 'pressure cooker')).toBe(true);
  });

  test('remove() keeps the key while another stored spelling still has it', async () => {
    await seedDictionary(await makeDir({ 'things.txt': 'Ice Cream\nIce-Cream\nCup\n' }));
    const dictionary = createDictionaryService();
    await dictionary.init();
    expect(dictionary.counts().thing).toBe(2);
    await dictionary.remove('thing', 'ice cream');
    expect(dictionary.has('thing', 'icecream')).toBe(true);
    await dictionary.remove('thing', 'ice-cream');
    expect(dictionary.has('thing', 'icecream')).toBe(false);
    expect(dictionary.has('thing', 'cup')).toBe(true);
  });

  test('unknown categories are rejected', async () => {
    const dictionary = createDictionaryService();
    expect(() => dictionary.has('colour', 'red')).toThrow(/Unknown category/);
  });
});

describe('/ready', () => {
  test('fails while the dictionary is empty and passes once it is loaded', async () => {
    const dictionary = createDictionaryService();
    const app = createTestApp({
      readinessChecks: [{ name: 'dictionary', check: () => dictionary.isReady() }],
    });
    const before = await request(app).get('/ready');
    expect(before.status).toBe(503);
    expect(before.body.checks.dictionary).toBe(false);
    await seedDictionary(await makeDir());
    await dictionary.init();
    const after = await request(app).get('/ready');
    expect(after.status).toBe(200);
  });
});
