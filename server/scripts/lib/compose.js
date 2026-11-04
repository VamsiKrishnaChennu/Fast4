import { cleanWords } from './text.js';

/**
 * Combines the contributions of several sources into one sorted word list and a per-source report.
 * Sources are applied in order, so "added" is what a source brings that earlier ones did not.
 * @param {{ category: string, contributions: Array<{ source: string, labels?: Iterable<string>, required?: boolean, error?: string, plausible?: boolean, minLetters?: number }>, isProfane?: (text: string) => boolean, blocked?: Set<string> }} input
 * @returns {{ words: string[], rows: Array<{ category: string, source: string, required: boolean, fetched: number, kept: number, added: number, rejects: Record<string, number>, error?: string, addedWords: string[] }>, profane: string[] }}
 */
export function composeList({ category, contributions, isProfane, blocked = new Set() }) {
  const seen = new Set();
  const rows = [];
  const profane = [];
  for (const contribution of contributions) {
    const {
      words,
      fetched,
      rejects,
      profane: removed,
    } = cleanWords(contribution.labels ?? [], {
      isProfane,
      plausible: contribution.plausible,
      minLetters: contribution.minLetters,
    });
    let kept = 0;
    const addedWords = [];
    for (const word of words) {
      if (blocked.has(word)) {
        rejects.blocked = (rejects.blocked ?? 0) + 1;
        continue;
      }
      kept += 1;
      if (!seen.has(word)) {
        seen.add(word);
        addedWords.push(word);
      }
    }
    profane.push(...removed);
    rows.push({
      category,
      source: contribution.source,
      required: Boolean(contribution.required),
      fetched,
      kept,
      added: addedWords.length,
      rejects,
      error: contribution.error,
      addedWords,
    });
  }
  return { words: [...seen].sort(), rows, profane };
}

/**
 * @param {Array<{ source: string, required: boolean, fetched: number, error?: string }>} rows
 * @returns {Array<{ source: string, error?: string }>} required sources that gave nothing
 */
export function emptyRequiredSources(rows) {
  return rows.filter((row) => row.required && row.fetched === 0);
}
