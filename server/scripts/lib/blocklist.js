/**
 * Words to keep out of the generated lists. One entry per line as "category: word", for example
 * "animal: animal". Lines starting with # are notes.
 * @param {string} text contents of starter/blocked.txt
 * @returns {Record<string, Set<string>>} blocked words by category
 */
export function parseBlocklist(text) {
  const blocked = { name: new Set(), place: new Set(), animal: new Set(), thing: new Set() };
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [category, ...rest] = trimmed.split(':');
    const word = rest.join(':').trim().toLowerCase();
    if (!blocked[category.trim()] || !word) {
      throw new Error(
        `Bad line in blocked.txt: "${trimmed}". Use "category: word", for example "animal: animal".`,
      );
    }
    blocked[category.trim()].add(word);
  }
  return blocked;
}
