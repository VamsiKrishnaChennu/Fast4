import { descendants, lemmasOf } from './wordnet.js';

/**
 * Picks animal and thing words out of one WordNet-style graph (Princeton 3.1 or Open English WordNet).
 *
 * Animals: every noun under animal. Things: every noun under physical entity or artifact, except the
 * SYNSETS that are animals, people, locations or physical processes (activities and reflexes are not
 * objects). The exclusion is by synset only. A word is never dropped because it also appears in
 * another list, so "kite" (a toy) stays a thing although the bird is an animal, and "mouse" or "pen"
 * stay things. Validation is per category, so nothing leaks between them.
 * @param {{ graph: { words: Map<string, string[]>, children: Map<string, string[]> }, root: (lemma: string) => string }} wordnet
 * @param {{ extraExcludedRoots?: string[] }} [options] more concepts whose synsets are not things; Open English
 *   WordNet files people under "actor" as well as "person"
 * @returns {{ animals: Set<string>, things: Set<string> }}
 */
export function selectAnimalsAndThings({ graph, root }, { extraExcludedRoots = [] } = {}) {
  const animalSet = descendants(graph, root('animal'));
  const excluded = new Set(animalSet);
  for (const concept of ['person', 'location', 'physical_process', ...extraExcludedRoots]) {
    for (const synset of descendants(graph, root(concept))) excluded.add(synset);
  }
  const physical = new Set([
    ...descendants(graph, root('physical_entity')),
    ...descendants(graph, root('artifact')),
  ]);
  const thingSynsets = new Set([...physical].filter((synset) => !excluded.has(synset)));
  return { animals: lemmasOf(graph, animalSet), things: lemmasOf(graph, thingSynsets) };
}
