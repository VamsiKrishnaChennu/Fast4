import { parseOewn } from '../../scripts/lib/oewn.js';
import { cleanWord, cleanWords, foldAccents } from '../../scripts/lib/text.js';
import { selectAnimalsAndThings } from '../../scripts/lib/selection.js';
import { lemmasOf, parseDataNoun } from '../../scripts/lib/wordnet.js';

describe('foldAccents and cleanWord', () => {
  test.each([
    ['Ümit', 'Umit'],
    ['Zoë', 'Zoe'],
    ['Søren', 'Soren'],
    ['Łukasz', 'Lukasz'],
    ['Straße', 'Strasse'],
    ['Ærø', 'aero'],
    ['O’Brien', "O'Brien"],
    ['Saint–Denis', 'Saint-Denis'],
  ])('%s becomes %s', (input, expected) => {
    expect(foldAccents(input).toLowerCase()).toBe(expected.toLowerCase());
  });

  test('accented names keep all their letters instead of losing them', () => {
    expect(cleanWord('Ümit')).toEqual({ word: 'umit' });
    expect(cleanWord('José')).toEqual({ word: 'jose' });
    expect(cleanWord('São Paulo')).toEqual({ word: 'sao paulo' });
  });

  test.each([
    ['तुलसी', 'script'],
    ['தமிழ்நாடு', 'script'],
    ['Ab1', 'symbols'],
    ['Paris, Texas', 'symbols'],
    ["'s-Hertogenbosch", 'start'],
    ['-abc', 'start'],
    ['X', 'short'],
    ['a'.repeat(31), 'long'],
  ])('%s is rejected as %s', (raw, reason) => {
    expect(cleanWord(raw)).toEqual({ reason });
  });

  test('place junk is caught by the plausibility check only when asked for', () => {
    expect(cleanWord('mttssaari')).toEqual({ word: 'mttssaari' });
    expect(cleanWord('mttssaari', { plausible: true })).toEqual({ reason: 'implausible' });
    expect(cleanWord('Aaarhus', { plausible: true })).toEqual({ reason: 'implausible' });
    expect(cleanWord('Szczecin', { plausible: true })).toEqual({ word: 'szczecin' });
    expect(cleanWord('Tamil Nadu', { plausible: true, minLetters: 3 })).toEqual({
      word: 'tamil nadu',
    });
    expect(cleanWord('Ab', { minLetters: 3 })).toEqual({ reason: 'short' });
  });

  test('profanity is rejected and counted with the other reasons', () => {
    const isProfane = (text) => text === 'badword';
    expect(cleanWord('Badword', { isProfane })).toEqual({ reason: 'profane' });
    const result = cleanWords(['Tulasi', 'tulasi', 'Badword', 'तुलसी', 'Ümit'], { isProfane });
    expect([...result.words].sort()).toEqual(['tulasi', 'umit']);
    expect(result.fetched).toBe(5);
    expect(result.rejects).toEqual({ profane: 1, script: 1 });
  });
});

describe('lemmasOf', () => {
  const graph = {
    words: new Map([
      [
        '1',
        [
          'Bengal_tiger',
          'tiger',
          'ice-cream_cone',
          'Ferris_wheel',
          'a_b_c_d',
          'x1',
          "devil's_claw",
        ],
      ],
      ['2', ['mother-in-law', 'US_dollar_2', 'Panthera_tigris']],
    ]),
  };
  test('allows one to three words, capitals and hyphens, and lower-cases them', () => {
    expect([...lemmasOf(graph, new Set(['1', '2']))].sort()).toEqual([
      'bengal tiger',
      "devil's claw",
      'ferris wheel',
      'ice-cream cone',
      'mother-in-law',
      'panthera tigris',
      'tiger',
    ]);
  });
  test('ignores unknown synsets', () => {
    expect([...lemmasOf(graph, new Set(['9']))]).toEqual([]);
  });
});

/** A tiny WordNet: kite is both a bird (animal) and a toy (artifact); tiger is only an animal and a person. */
function tinyWordnet() {
  const tree = {
    entity: ['physical_entity'],
    physical_entity: [
      'organism',
      'artifact',
      'person',
      'location',
      'food',
      'physical_process',
      'actor',
    ],
    organism: ['animal'],
    animal: ['bird', 'big_cat'],
    bird: ['kite_bird'],
    big_cat: ['tiger_cat', 'bengal'],
    artifact: ['toy', 'device'],
    toy: ['kite_toy'],
    device: ['mouse_device'],
    person: ['tiger_person'],
    location: ['region'],
    food: ['mango_fruit'],
    physical_process: ['coitus_act'],
    actor: ['admirer_person'],
  };
  const lemmas = {
    kite_bird: ['kite'],
    tiger_cat: ['tiger', 'Panthera tigris'],
    bengal: ['Bengal tiger'],
    kite_toy: ['kite'],
    mouse_device: ['mouse'],
    tiger_person: ['tiger', 'fire eater'],
    region: ['hill'],
    mango_fruit: ['mango', 'Mangifera indica'],
    animal: ['animal'],
    coitus_act: ['coitus'],
    admirer_person: ['admirer'],
    physical_process: ['physical process'],
    actor: ['actor'],
    physical_entity: ['physical entity'],
    artifact: ['artifact'],
    person: ['person'],
    location: ['location'],
  };
  const words = new Map(Object.entries(lemmas));
  const children = new Map(Object.entries(tree));
  return { graph: { words, children }, root: (lemma) => lemma };
}

describe('selectAnimalsAndThings', () => {
  const { animals, things } = selectAnimalsAndThings(tinyWordnet());

  test('a word in an animal synset and in a toy synset stays a thing (kite)', () => {
    expect(animals.has('kite')).toBe(true);
    expect(things.has('kite')).toBe(true);
  });

  test('a word only in animal or person synsets never enters things (tiger)', () => {
    expect(animals.has('tiger')).toBe(true);
    expect(things.has('tiger')).toBe(false);
    expect(things.has('fire eater')).toBe(false);
    expect(things.has('hill')).toBe(false);
  });

  test('a capital-letter lemma is kept lower-cased in animals', () => {
    expect(animals.has('bengal tiger')).toBe(true);
    expect(animals.has('panthera tigris')).toBe(true);
    expect(things.has('bengal tiger')).toBe(false);
  });

  test('activities and processes are not objects, and people filed under actor are excluded on request', () => {
    expect(things.has('coitus')).toBe(false);
    expect(things.has('admirer')).toBe(true);
    const strict = selectAnimalsAndThings(tinyWordnet(), { extraExcludedRoots: ['actor'] });
    expect(strict.things.has('admirer')).toBe(false);
    expect(strict.things.has('kite')).toBe(true);
  });

  test('ordinary objects and foods are things, and nothing is compared with other lists', () => {
    expect(things.has('mouse')).toBe(true);
    expect(things.has('mango')).toBe(true);
    expect(things.has('mangifera indica')).toBe(true);
  });
});

describe('parseOewn', () => {
  const xml = `<?xml version="1.0"?>
<LexicalResource>
  <Lexicon id="oewn">
    <LexicalEntry id="oewn-animal-n">
      <Lemma writtenForm="animal" partOfSpeech="n"/>
      <Sense id="s1" synset="oewn-1-n"/>
    </LexicalEntry>
    <LexicalEntry id="oewn-animal-a">
      <Lemma writtenForm="animal" partOfSpeech="a"/>
      <Sense id="s2" synset="oewn-9-a"/>
    </LexicalEntry>
    <LexicalEntry id="oewn-tiger-n">
      <Lemma writtenForm="tiger" partOfSpeech="n">
        <Pronunciation variety="US">x</Pronunciation>
      </Lemma>
      <Sense id="s3" synset="oewn-2-n">
        <SenseRelation relType="derivation" target="x"/>
      </Sense>
      <Sense id="s4" synset="oewn-3-n"/>
    </LexicalEntry>
    <LexicalEntry id="oewn-bengal_tiger-n">
      <Lemma writtenForm="Bengal tiger" partOfSpeech="n"/>
      <Sense id="s5" synset="oewn-2-n"/>
    </LexicalEntry>
    <LexicalEntry id="oewn--ap-hood-n">
      <Lemma writtenForm="&apos;hood &amp; co" partOfSpeech="n"/>
      <Sense id="s6" synset="oewn-4-n"/>
    </LexicalEntry>
    <Synset id="oewn-1-n" members="oewn-animal-n" partOfSpeech="n">
      <SynsetRelation relType="hyponym" target="oewn-2-n"/>
    </Synset>
    <Synset id="oewn-2-n" members="oewn-tiger-n" partOfSpeech="n">
      <SynsetRelation relType="hypernym" target="oewn-1-n"/>
      <SynsetRelation relType="instance_hypernym" target="oewn-5-n"/>
    </Synset>
    <Synset id="oewn-9-a" members="oewn-animal-a" partOfSpeech="a">
      <SynsetRelation relType="hypernym" target="oewn-1-n"/>
    </Synset>
  </Lexicon>
</LexicalResource>`.split('\n');

  test('reads nouns, hypernym links and the first noun sense of a lemma', async () => {
    const { graph, root } = await parseOewn(xml);
    expect(root('animal')).toBe('oewn-1-n');
    expect(root('tiger')).toBe('oewn-2-n');
    expect(graph.words.get('oewn-2-n')).toEqual(['tiger', 'Bengal tiger']);
    expect(graph.words.get('oewn-4-n')).toEqual(["'hood & co"]);
    expect(graph.children.get('oewn-1-n')).toEqual(['oewn-2-n']);
    expect(graph.children.has('oewn-5-n')).toBe(false);
    expect(graph.words.has('oewn-9-a')).toBe(false);
  });

  test('asking for a lemma it does not have is an error', async () => {
    const { root } = await parseOewn(xml);
    expect(() => root('physical_entity')).toThrow(/no noun "physical_entity"/);
  });

  test('decodes numeric entities', async () => {
    const { graph } = await parseOewn([
      '<LexicalEntry id="a">',
      '<Lemma writtenForm="caf&#233; &#x41;" partOfSpeech="n"/>',
      '<Sense id="s" synset="oewn-7-n"/>',
      '</LexicalEntry>',
    ]);
    expect(graph.words.get('oewn-7-n')).toEqual(['café A']);
  });
});

describe('parseDataNoun still follows only ordinary hypernym links', () => {
  test('an instance link is not a child link', () => {
    const line = (offset, lemma, pointers) =>
      `${offset} 03 n 01 ${lemma} 0 ${String(pointers.length).padStart(3, '0')} ${pointers
        .map(([symbol, target]) => `${symbol} ${target} n 0000`)
        .join(' ')} | gloss`;
    const data = [
      line('00000001', 'animal', []),
      line('00000002', 'tiger', [['@', '00000001']]),
      line('00000003', 'Tigger', [['@i', '00000001']]),
    ].join('\n');
    const { children } = parseDataNoun(data);
    expect(children.get('00000001')).toEqual(['00000002']);
  });
});
