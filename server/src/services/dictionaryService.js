import { CATEGORIES } from '@fastfour/shared';
import { DictionaryEntry } from '../models/DictionaryEntry.js';

/**
 * In-memory word sets for instant judging. Loaded once at startup, kept in step with the database.
 * @param {{ model?: typeof DictionaryEntry }} [deps]
 */
export function createDictionaryService({ model = DictionaryEntry } = {}) {
  const sets = new Map(CATEGORIES.map((c) => [c, new Set()]));
  let loaded = false;

  const setFor = (category) => {
    const set = sets.get(category);
    if (!set) throw new Error(`Unknown category: ${category}`);
    return set;
  };

  return {
    /** Loads every entry from MongoDB into memory. Call once before accepting connections. */
    async init() {
      const fresh = new Map(CATEGORIES.map((c) => [c, new Set()]));
      for await (const entry of model.find({}, { category: 1, word: 1, _id: 0 }).lean().cursor()) {
        fresh.get(entry.category)?.add(entry.word);
      }
      for (const category of CATEGORIES) sets.set(category, fresh.get(category));
      loaded = true;
    },

    /** @returns {boolean} true when the normalized word is in the category */
    has(category, normalized) {
      return setFor(category).has(normalized);
    },

    /**
     * Adds a word that won an appeal. Saved to the database and usable at once.
     * @param {string} category
     * @param {string} normalized
     * @param {string} [displayWord]
     */
    async add(category, normalized, displayWord = normalized) {
      const set = setFor(category);
      await model.updateOne(
        { category, word: normalized },
        { $setOnInsert: { displayWord, source: 'external' } },
        { upsert: true },
      );
      set.add(normalized);
    },

    /** Admin only: removes a word from the database and from memory. */
    async remove(category, normalized) {
      const set = setFor(category);
      await model.deleteOne({ category, word: normalized });
      set.delete(normalized);
    },

    /** @returns {Record<string, number>} word count per category */
    counts() {
      return Object.fromEntries(CATEGORIES.map((c) => [c, sets.get(c).size]));
    },

    /** @returns {boolean} true once loaded and every category has words (used by /ready) */
    isReady() {
      return loaded && CATEGORIES.every((c) => sets.get(c).size > 0);
    },
  };
}
