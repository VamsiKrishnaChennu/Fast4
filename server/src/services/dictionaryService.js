import { CATEGORIES, dictionaryKey } from '@fastfour/shared';
import { DictionaryEntry } from '../models/DictionaryEntry.js';

/** Matches every stored spelling of a key: "icecream" matches "ice cream", "ice-cream" and "icecream". */
function spellingsOf(key) {
  return new RegExp(`^[ '-]*${[...key].join("[ '-]*")}[ '-]*$`);
}

/**
 * In-memory word sets for instant judging. Loaded once at startup, kept in step with the database.
 * The sets hold dictionary keys (no spaces, hyphens or apostrophes), so "Tamilnadu" finds "Tamil Nadu".
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
        fresh.get(entry.category)?.add(dictionaryKey(entry.word));
      }
      for (const category of CATEGORIES) sets.set(category, fresh.get(category));
      loaded = true;
    },

    /** @returns {boolean} true when the normalized word is in the category, ignoring spaces and hyphens */
    has(category, normalized) {
      return setFor(category).has(dictionaryKey(normalized));
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
      set.add(dictionaryKey(normalized));
    },

    /**
     * Admin only: removes a word from the database and from memory. The key stays in memory while
     * another stored spelling ("ice-cream" for "ice cream") still has it.
     */
    async remove(category, normalized) {
      const set = setFor(category);
      await model.deleteOne({ category, word: normalized });
      const key = dictionaryKey(normalized);
      if (!(await model.exists({ category, word: spellingsOf(key) }))) set.delete(key);
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
