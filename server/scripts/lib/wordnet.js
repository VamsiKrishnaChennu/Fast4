import { readFile } from 'node:fs/promises';

/**
 * Reads the WordNet noun files and answers "which words sit under this concept".
 * Only ordinary hypernym links ("is a kind of") are followed, not named instances.
 */

/**
 * @param {string} dataText contents of WordNet data.noun
 * @returns {{ words: Map<string, string[]>, children: Map<string, string[]> }} words by synset offset, and child offsets by parent offset
 */
export function parseDataNoun(dataText) {
  const words = new Map();
  const children = new Map();
  for (const line of dataText.split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const fields = line.split(' ');
    const offset = fields[0];
    const wordCount = parseInt(fields[3], 16);
    const lemmas = [];
    for (let i = 0; i < wordCount; i += 1) lemmas.push(fields[4 + i * 2]);
    words.set(offset, lemmas);
    const pointerCount = parseInt(fields[4 + wordCount * 2], 10);
    let at = 5 + wordCount * 2;
    for (let i = 0; i < pointerCount; i += 1, at += 4) {
      if (fields[at] !== '@') continue; // hypernym: this synset is a kind of fields[at + 1]
      const parent = fields[at + 1];
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(offset);
    }
  }
  return { words, children };
}

/**
 * @param {string} indexText contents of WordNet index.noun
 * @param {string} lemma for example "animal"
 * @returns {string} offset of the lemma's first (most common) sense
 * @throws {Error} when the lemma is not in the index
 */
export function firstSense(indexText, lemma) {
  const line = indexText.split('\n').find((l) => l.startsWith(`${lemma} n `));
  if (!line) throw new Error(`WordNet has no noun "${lemma}"`);
  const fields = line.split(' ').filter(Boolean);
  const pointerSymbols = parseInt(fields[3], 10);
  return fields[6 + pointerSymbols];
}

/**
 * @param {{ children: Map<string, string[]> }} graph
 * @param {string} rootOffset
 * @returns {Set<string>} the root and every synset below it
 */
export function descendants(graph, rootOffset) {
  const seen = new Set([rootOffset]);
  const stack = [rootOffset];
  while (stack.length) {
    for (const child of graph.children.get(stack.pop()) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        stack.push(child);
      }
    }
  }
  return seen;
}

/**
 * Plain lower-case English lemmas of one or two words (letters, hyphen and apostrophe only).
 * @param {{ words: Map<string, string[]> }} graph
 * @param {Set<string>} offsets
 * @returns {Set<string>}
 */
export function lemmasOf(graph, offsets) {
  const out = new Set();
  for (const offset of offsets) {
    for (const lemma of graph.words.get(offset) ?? []) {
      if (/[A-Z0-9]/.test(lemma)) continue;
      const text = lemma.replace(/_/g, ' ');
      if (/^[a-z]+(?:[ '-][a-z]+)?$/.test(text)) out.add(text);
    }
  }
  return out;
}

/**
 * Loads WordNet from a folder holding data.noun and index.noun.
 * @param {string} dictDir
 */
export async function loadWordnet(dictDir) {
  const [dataText, indexText] = await Promise.all([
    readFile(`${dictDir}/data.noun`, 'utf8'),
    readFile(`${dictDir}/index.noun`, 'utf8'),
  ]);
  const graph = parseDataNoun(dataText);
  return { graph, root: (lemma) => firstSense(indexText, lemma) };
}
