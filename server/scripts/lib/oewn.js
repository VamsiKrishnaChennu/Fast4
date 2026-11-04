import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

/**
 * Reads Open English WordNet (CC BY 4.0, GWN-LMF XML) without an XML library. The file is pretty
 * printed with one tag per line, so a line reader is enough:
 *   LexicalEntry > Lemma writtenForm + Sense synset="..."
 *   Synset > SynsetRelation relType="hypernym" target="..."
 * Only nouns and ordinary hypernym links are used (instance_hypernym is a different relation).
 * The result has the same shape as the Princeton WordNet graph in wordnet.js.
 */

const ENTITIES = { '&apos;': "'", '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>' };

function decode(text) {
  return text
    .replace(/&(?:apos|quot|amp|lt|gt);/g, (e) => ENTITIES[e])
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

const attr = (line, name) => line.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/**
 * @param {AsyncIterable<string> | Iterable<string>} lines the XML, one line at a time
 * @returns {Promise<{ graph: { words: Map<string, string[]>, children: Map<string, string[]> }, root: (lemma: string) => string }>}
 *   root("physical_entity") returns the first noun sense of "physical entity", as wordnet.js does for 3.1
 */
export async function parseOewn(lines) {
  const words = new Map();
  const children = new Map();
  const firstSense = new Map();
  let entry = null;
  let synset = null;

  for await (const line of lines) {
    if (line.includes('<LexicalEntry ')) {
      entry = { lemma: null, isNoun: false, senses: [] };
    } else if (entry && line.includes('<Lemma ')) {
      entry.lemma = decode(attr(line, 'writtenForm') ?? '');
      entry.isNoun = attr(line, 'partOfSpeech') === 'n';
    } else if (entry?.isNoun && line.includes('<Sense ')) {
      const target = attr(line, 'synset');
      if (target) entry.senses.push(target);
    } else if (line.includes('</LexicalEntry>')) {
      if (entry?.isNoun && entry.lemma) {
        for (const target of entry.senses) {
          if (!words.has(target)) words.set(target, []);
          words.get(target).push(entry.lemma);
        }
        if (entry.senses.length && !firstSense.has(entry.lemma)) {
          firstSense.set(entry.lemma, entry.senses[0]);
        }
      }
      entry = null;
    } else if (line.includes('<Synset ')) {
      synset = attr(line, 'partOfSpeech') === 'n' ? attr(line, 'id') : null;
    } else if (
      synset &&
      line.includes('<SynsetRelation ') &&
      attr(line, 'relType') === 'hypernym'
    ) {
      const parent = attr(line, 'target');
      if (parent) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(synset);
      }
    } else if (line.includes('</Synset>')) {
      synset = null;
    }
  }

  const root = (lemma) => {
    const found = firstSense.get(lemma.replace(/_/g, ' '));
    if (!found) throw new Error(`Open English WordNet has no noun "${lemma}"`);
    return found;
  };
  return { graph: { words, children }, root };
}

/**
 * Loads Open English WordNet from the cached .xml.gz file.
 * @param {string} gzPath
 */
export function loadOewn(gzPath) {
  const input = createReadStream(gzPath).pipe(createGunzip());
  return parseOewn(createInterface({ input, crlfDelay: Infinity }));
}
