import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeAnswer } from '@fastfour/shared';
import { DictionaryEntry } from '../models/DictionaryEntry.js';

export const DICTIONARY_FILES = {
  name: 'names.txt',
  place: 'places.txt',
  animal: 'animals.txt',
  thing: 'things.txt',
};

const BATCH = 5000;

/**
 * Reads one word per line, normalizes each, and drops empties and duplicates.
 * @param {string} text file contents
 * @returns {Array<{ word: string, displayWord: string }>}
 */
export function parseWordList(text) {
  const seen = new Set();
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const displayWord = line.trim();
    const word = normalizeAnswer(displayWord);
    if (word.length < 2 || seen.has(word)) continue;
    seen.add(word);
    out.push({ word, displayWord });
  }
  return out;
}

/**
 * Loads the dictionary files into MongoDB. Safe to run again: existing entries are left alone.
 * @param {string} dir folder holding names.txt, places.txt, animals.txt and things.txt
 * @param {{ model?: typeof DictionaryEntry }} [deps]
 * @returns {Promise<Record<string, { read: number, added: number }>>}
 */
export async function seedDictionary(dir, { model = DictionaryEntry } = {}) {
  const report = {};
  for (const [category, file] of Object.entries(DICTIONARY_FILES)) {
    const entries = parseWordList(await readFile(path.join(dir, file), 'utf8'));
    let added = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const ops = entries.slice(i, i + BATCH).map(({ word, displayWord }) => ({
        updateOne: {
          filter: { category, word },
          update: { $setOnInsert: { displayWord, source: 'seed', overturnedCount: 0 } },
          upsert: true,
        },
      }));
      const result = await model.bulkWrite(ops, { ordered: false });
      added += result.upsertedCount;
    }
    report[category] = { read: entries.length, added };
  }
  return report;
}
