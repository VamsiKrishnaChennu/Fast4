import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { DictionaryEntry } from '../../src/models/DictionaryEntry.js';
import { createDictionaryService } from '../../src/services/dictionaryService.js';
import { parseWordList, seedDictionary } from '../../src/services/dictionarySeeder.js';
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
      name: { read: 3, added: 3 },
      place: { read: 3, added: 3 },
      animal: { read: 2, added: 2 },
      thing: { read: 3, added: 3 },
    });
    const second = await seedDictionary(dir);
    expect(Object.values(second).map((r) => r.added)).toEqual([0, 0, 0, 0]);
    expect(await DictionaryEntry.countDocuments()).toBe(11);
    const stored = await DictionaryEntry.findOne({ category: 'thing', word: 'ice-cream' });
    expect(stored).toMatchObject({ displayWord: 'Ice-Cream', source: 'seed', overturnedCount: 0 });
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
