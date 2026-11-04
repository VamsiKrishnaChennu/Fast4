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
 * With `replace`, entries that came from an earlier seed (source "seed") and are no longer in the
 * files are deleted. Entries added by appeals (source "external") are never touched.
 * @param {string} dir folder holding names.txt, places.txt, animals.txt and things.txt
 * @param {{ model?: typeof DictionaryEntry, replace?: boolean }} [options]
 * @returns {Promise<Record<string, { read: number, added: number, removed: number, total: number }>>}
 *   total is the number of entries now in the database for that category
 */
export async function seedDictionary(dir, { model = DictionaryEntry, replace = false } = {}) {
  const report = {};
  for (const [category, file] of Object.entries(DICTIONARY_FILES)) {
    const entries = parseWordList(await readFile(path.join(dir, file), 'utf8'));
    if (replace && entries.length === 0) {
      throw new Error(
        `${file} has no words, so --replace would delete the whole ${category} list.`,
      );
    }
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
    const removed = replace ? await removeStaleSeedEntries(model, category, entries) : 0;
    report[category] = {
      read: entries.length,
      added,
      removed,
      total: await model.countDocuments({ category }),
    };
  }
  return report;
}

/** Deletes "seed" entries of one category whose word is not in the current file. */
async function removeStaleSeedEntries(model, category, entries) {
  const inFile = new Set(entries.map((e) => e.word));
  const stale = [];
  for await (const entry of model.find({ category, source: 'seed' }, { word: 1, _id: 0 }).lean()) {
    if (!inFile.has(entry.word)) stale.push(entry.word);
  }
  for (let i = 0; i < stale.length; i += BATCH) {
    const ops = stale.slice(i, i + BATCH).map((word) => ({
      deleteOne: { filter: { category, word, source: 'seed' } },
    }));
    await model.bulkWrite(ops, { ordered: false });
  }
  return stale.length;
}
