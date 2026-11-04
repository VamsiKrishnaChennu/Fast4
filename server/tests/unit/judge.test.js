import { jest } from '@jest/globals';
import { createJudgeService, createMemoryJudgeCache } from '../../src/services/judgeService.js';
import { JudgeUnavailableError } from '../../src/utils/AppErrors.js';
import { loadEnv } from '../../src/config/env.js';
import { validEnvSource } from '../helpers/createTestApp.js';

const UA = 'FastFour/1.0 (test@example.com)';
const env = loadEnv({ ...validEnvSource, WIKIDATA_USER_AGENT: UA });
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const notFound = () =>
  json(
    { title: 'No Definitions Found', message: 'Sorry pal, we could not find definitions.' },
    404,
  );
const htmlNotFound = () =>
  new Response(
    '<html><body><h5>ERROR 404!!!</h5><p>Sorry,that page does not exist</p></body></html>',
    { status: 404, headers: { 'content-type': 'text/html' } },
  );
const hit = (id, text) => ({ id, label: text, match: { type: 'label', text } });

/** Fake internet: pass handlers for the three services. */
function internet({
  search = () => json({ search: [] }),
  sparql = () => json({ results: { bindings: [] } }),
  dict = () => notFound(),
} = {}) {
  const calls = [];
  const fetchImpl = jest.fn(async (url, options) => {
    const u = new URL(String(url));
    calls.push({ url: u, options });
    if (u.hostname === 'www.wikidata.org') return search(u, options);
    if (u.hostname === 'query.wikidata.org') return sparql(u, options);
    return dict(u, options);
  });
  return { fetchImpl, calls };
}
const judge = (net, extra = {}) => createJudgeService({ env, fetchImpl: net.fetchImpl, ...extra });
const yes = () => json({ results: { bindings: [{ item: { value: 'x' } }] } });
const noun = [{ meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'a thing' }] }] }];

describe('names, places and animals through Wikidata', () => {
  test('a name that is a given name is valid', async () => {
    const net = internet({ search: () => json({ search: [hit('Q1', 'Sam')] }), sparql: yes });
    expect(await judge(net).check('name', 'sam')).toEqual({ result: 'valid', source: 'wikidata' });
    expect(net.calls[1].url.searchParams.get('query')).toContain('Q202444');
  });

  test('candidates that are not given names make it invalid', async () => {
    const net = internet({ search: () => json({ search: [hit('Q2', 'Table')] }) });
    expect(await judge(net).check('name', 'table')).toEqual({
      result: 'invalid',
      source: 'wikidata',
    });
  });

  test('no candidates at all is inconclusive', async () => {
    const net = internet();
    expect(await judge(net).check('name', 'zzqx')).toEqual({
      result: 'inconclusive',
      source: 'wikidata',
    });
    expect(net.calls).toHaveLength(1);
  });

  test('a place is valid when it is a geographic location', async () => {
    const net = internet({ search: () => json({ search: [hit('Q3', 'Sirsi')] }), sparql: yes });
    expect(await judge(net).check('place', 'sirsi')).toEqual({
      result: 'valid',
      source: 'wikidata',
    });
    expect(net.calls[1].url.searchParams.get('query')).toContain('Q2221906');
  });

  test('spaces and hyphens are ignored: "tamilnadu" matches the label "Tamil Nadu"', async () => {
    const net = internet({
      search: () => json({ search: [hit('Q1445', 'Tamil Nadu'), hit('Q9', 'Tamil Nadu Tourism')] }),
      sparql: yes,
    });
    expect(await judge(net).check('place', 'tamilnadu')).toEqual({
      result: 'valid',
      source: 'wikidata',
    });
    expect(net.calls[1].url.searchParams.get('query')).toContain('wd:Q1445');
    expect(net.calls[1].url.searchParams.get('query')).not.toContain('wd:Q9 ');
  });

  test('a place name that only a person has is invalid', async () => {
    const net = internet({ search: () => json({ search: [hit('Q4', 'Maya')] }) });
    expect(await judge(net).check('place', 'maya')).toMatchObject({ result: 'invalid' });
  });

  test('an animal found as a taxon under Animalia is valid', async () => {
    const net = internet({ search: () => json({ search: [hit('Q5', 'Tiger')] }), sparql: yes });
    expect(await judge(net).check('animal', 'tiger')).toEqual({
      result: 'valid',
      source: 'wikidata',
    });
    const animalQuery = net.calls[1].url.searchParams.get('query');
    expect(animalQuery).toContain('Q729');
    expect(animalQuery).toContain('hint:gearing "forward"');
  });

  test('an animal missing on Wikidata but described as one by the dictionary is valid', async () => {
    const net = internet({
      dict: () =>
        json([
          {
            meanings: [
              {
                partOfSpeech: 'noun',
                definitions: [{ definition: 'A small Mammal of the forest.' }],
              },
            ],
          },
        ]),
    });
    expect(await judge(net).check('animal', 'quokka')).toEqual({
      result: 'valid',
      source: 'dictionaryapi',
    });
  });

  test('an animal missing everywhere, or with no animal keyword, is inconclusive', async () => {
    const withText = internet({ dict: () => json(noun) });
    expect(await judge(withText).check('animal', 'blorf')).toEqual({
      result: 'inconclusive',
      source: 'dictionaryapi',
    });
    const notFound = internet();
    expect(await judge(notFound).check('animal', 'blorf')).toMatchObject({
      result: 'inconclusive',
    });
  });

  test('partial label matches are filtered out', async () => {
    const net = internet({
      search: () =>
        json({
          search: [
            hit('Q6', 'Appl'),
            { id: 'Q7', label: 'Applesauce', match: { type: 'label', text: 'Applesauce' } },
          ],
        }),
    });
    expect(await judge(net).check('name', 'apple')).toMatchObject({ result: 'inconclusive' });
  });

  test('aliases count when the alias equals the word', async () => {
    const net = internet({
      search: () =>
        json({ search: [{ id: 'Q8', label: 'Samuel', match: { type: 'alias', text: 'Sam' } }] }),
      sparql: yes,
    });
    expect(await judge(net).check('name', 'sam')).toMatchObject({ result: 'valid' });
  });

  test('a response without a search list counts as no candidates', async () => {
    const net = internet({ search: () => json({}) });
    expect(await judge(net).check('name', 'sam')).toMatchObject({ result: 'inconclusive' });
  });
});

describe('things through the dictionary API', () => {
  test('a noun meaning is valid', async () => {
    const net = internet({ dict: () => json(noun) });
    expect(await judge(net).check('thing', 'table')).toEqual({
      result: 'valid',
      source: 'dictionaryapi',
    });
  });

  test('404 is invalid', async () => {
    expect(await judge(internet()).check('thing', 'blorf')).toEqual({
      result: 'invalid',
      source: 'dictionaryapi',
    });
  });

  test('an HTML 404 page from the service is inconclusive, not invalid', async () => {
    const net = internet({ dict: () => htmlNotFound() });
    expect(await judge(net).check('thing', 'window')).toEqual({
      result: 'inconclusive',
      source: 'dictionaryapi',
    });
  });

  test('only verb or adjective meanings is invalid', async () => {
    const net = internet({
      dict: () => json([{ meanings: [{ partOfSpeech: 'adjective' }, { partOfSpeech: 'verb' }] }]),
    });
    expect(await judge(net).check('thing', 'happy')).toMatchObject({ result: 'invalid' });
  });

  test('an odd body counts as no noun', async () => {
    const net = internet({ dict: () => json({ title: 'No Definitions Found' }) });
    expect(await judge(net).check('thing', 'blorf')).toMatchObject({ result: 'invalid' });
  });

  test('multi-word answers are encoded in the path', async () => {
    const net = internet({ dict: () => json(noun) });
    await judge(net).check('thing', 'ice cream');
    expect(net.calls[0].url.pathname).toMatch(/ice%20cream$/);
  });
});

describe('errors are not results', () => {
  test.each([
    ['HTTP 500', () => json({}, 500)],
    ['HTTP 403', () => json({}, 403)],
    ['HTTP 429', () => json({}, 429)],
    [
      'a network failure',
      () => {
        throw new Error('offline');
      },
    ],
    [
      'an unreadable body',
      () => ({
        status: 200,
        ok: true,
        json: async () => {
          throw new Error('bad json');
        },
      }),
    ],
  ])('%s throws JudgeUnavailableError and nothing is cached', async (label, search) => {
    const net = internet({ search });
    const service = judge(net);
    await expect(service.check('name', 'sam')).rejects.toBeInstanceOf(JudgeUnavailableError);
    await expect(service.check('name', 'sam')).rejects.toBeInstanceOf(JudgeUnavailableError);
    expect(net.fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(label === 'HTTP 429' ? 1 : 2);
  });

  test('an error on the second Wikidata step also throws', async () => {
    const net = internet({
      search: () => json({ search: [hit('Q1', 'Sam')] }),
      sparql: () => json({}, 500),
    });
    await expect(judge(net).check('name', 'sam')).rejects.toBeInstanceOf(JudgeUnavailableError);
  });

  test('a dictionary API 500 throws', async () => {
    const net = internet({ dict: () => json({}, 500) });
    await expect(judge(net).check('thing', 'table')).rejects.toBeInstanceOf(JudgeUnavailableError);
    const odd = internet({ dict: () => json({}, 403) });
    await expect(judge(odd).check('thing', 'table')).rejects.toBeInstanceOf(JudgeUnavailableError);
  });

  test('running out of time throws, covering both steps together', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn(
        (url, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      const pending = createJudgeService({ env, fetchImpl }).check('name', 'sam');
      const assertion = expect(pending).rejects.toBeInstanceOf(JudgeUnavailableError);
      await jest.advanceTimersByTimeAsync(6000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  test('an unexpected failure is reported as unavailable', async () => {
    const cache = {
      get: async () => null,
      set: async () => {
        throw new Error('db down');
      },
    };
    const net = internet({ dict: () => json(noun) });
    await expect(judge(net, { cache }).check('thing', 'table')).rejects.toThrow('db down');
  });

  test('after HTTP 429 the source is left alone until the wait is over', async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const net = internet({ dict: () => json({}, 429, { 'retry-after': '3' }) });
    const service = judge(net, { now });
    await expect(service.check('thing', 'table')).rejects.toBeInstanceOf(JudgeUnavailableError);
    const before = net.fetchImpl.mock.calls.length;
    await expect(service.check('thing', 'chair')).rejects.toBeInstanceOf(JudgeUnavailableError);
    expect(net.fetchImpl.mock.calls.length).toBe(before);
    clock += 3001;
    const ok = internet({ dict: () => json(noun) });
    const later = createJudgeService({ env, fetchImpl: ok.fetchImpl, now });
    expect(await later.check('thing', 'chair')).toMatchObject({ result: 'valid' });
  });

  test('a 429 without a retry-after header waits two seconds', async () => {
    let clock = 5_000;
    const net = internet({ dict: () => json({}, 429) });
    const service = judge(net, { now: () => clock });
    await expect(service.check('thing', 'table')).rejects.toBeInstanceOf(JudgeUnavailableError);
    clock += 1_000;
    const calls = net.fetchImpl.mock.calls.length;
    await expect(service.check('thing', 'chair')).rejects.toBeInstanceOf(JudgeUnavailableError);
    expect(net.fetchImpl.mock.calls.length).toBe(calls);
    clock += 1_500;
    await expect(service.check('thing', 'chair')).rejects.toBeInstanceOf(JudgeUnavailableError);
    expect(net.fetchImpl.mock.calls.length).toBe(calls + 1);
  });
});

describe('caching and coalescing', () => {
  test('a second check of the same word is served from the cache without a request', async () => {
    const net = internet({ dict: () => json(noun) });
    const service = judge(net);
    await service.check('thing', 'table');
    const count = net.fetchImpl.mock.calls.length;
    expect(await service.check('thing', 'table')).toEqual({ result: 'valid', source: 'cache' });
    expect(net.fetchImpl.mock.calls.length).toBe(count);
  });

  test('five simultaneous checks send one request', async () => {
    const net = internet({
      dict: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return json(noun);
      },
    });
    const service = judge(net);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.check('thing', 'table')),
    );
    expect(results.every((r) => r.result === 'valid')).toBe(true);
    expect(net.fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('cache lifetimes: valid never, invalid 30 days, inconclusive 1 day', async () => {
    const now = () => 1_000;
    const stored = {};
    const cache = {
      get: async () => null,
      set: async (c, w, e) => {
        stored[w] = e;
      },
    };
    const net = internet({
      search: (u) =>
        json({
          search:
            u.searchParams.get('search') === 'sam'
              ? [hit('Q1', 'Sam')]
              : u.searchParams.get('search') === 'table'
                ? [hit('Q2', 'Table')]
                : [],
        }),
      sparql: (u) =>
        /wd:Q1\b/.test(u.searchParams.get('query')) ? yes() : json({ results: { bindings: [] } }),
    });
    const service = judge(net, { cache, now });
    await service.check('name', 'sam');
    await service.check('name', 'table');
    await service.check('name', 'nothing');
    expect(stored.sam).toMatchObject({ result: 'valid', expireAt: null });
    expect(stored.table).toMatchObject({ result: 'invalid', expireAt: 1_000 + 30 * 86_400_000 });
    expect(stored.nothing).toMatchObject({ result: 'inconclusive', expireAt: 1_000 + 86_400_000 });
  });

  test('the memory cache drops expired entries', async () => {
    let clock = 0;
    const cache = createMemoryJudgeCache(() => clock);
    await cache.set('thing', 'x', { result: 'invalid', expireAt: 100 });
    expect(await cache.get('thing', 'x')).toMatchObject({ result: 'invalid' });
    clock = 100;
    expect(await cache.get('thing', 'x')).toBeNull();
    expect(await cache.get('thing', 'never')).toBeNull();
  });

  test('at most two requests run at once per source', async () => {
    let active = 0;
    let peak = 0;
    const net = internet({
      dict: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
        return json(noun);
      },
    });
    const service = judge(net);
    await Promise.all(
      ['table', 'chair', 'spoon', 'clock', 'lamp'].map((w) => service.check('thing', w)),
    );
    expect(peak).toBe(2);
  });
});

describe('requests', () => {
  test('send the configured User-Agent and only the word', async () => {
    const net = internet({ search: () => json({ search: [hit('Q1', 'Sam')] }), sparql: yes });
    await judge(net).check('name', 'sam');
    for (const { options } of net.calls) expect(options.headers['User-Agent']).toBe(UA);
    const search = net.calls[0].url.searchParams;
    expect(search.get('search')).toBe('sam');
    expect([...search.keys()].sort()).toEqual([
      'action',
      'format',
      'language',
      'limit',
      'search',
      'type',
    ]);
  });

  test('falls back to a default User-Agent', async () => {
    const plain = loadEnv(validEnvSource);
    const net = internet({ dict: () => json(noun) });
    await createJudgeService({ env: plain, fetchImpl: net.fetchImpl }).check('thing', 'table');
    expect(net.calls[0].options.headers['User-Agent']).toBe('FastFour/1.0');
  });

  test('JUDGE_ENABLED=false answers inconclusive with no request', async () => {
    const off = loadEnv({ ...validEnvSource, JUDGE_ENABLED: 'false' });
    const net = internet();
    expect(
      await createJudgeService({ env: off, fetchImpl: net.fetchImpl }).check('name', 'sam'),
    ).toEqual({ result: 'inconclusive', source: 'none' });
    expect(net.fetchImpl).not.toHaveBeenCalled();
  });
});

describe('diagnostics', () => {
  test('errors say why: timeout, network, http status and paused source', async () => {
    const reason = async (search) => {
      const net = internet({ search });
      try {
        await judge(net).check('name', 'sam');
      } catch (err) {
        return err.reason;
      }
      return null;
    };
    expect(await reason(() => json({}, 429))).toBe('http 429');
    expect(await reason(() => json({}, 503))).toBe('http 503');
    expect(await reason(() => json({}, 403))).toBe('http 403');
    expect(
      await reason(() => {
        throw new Error('offline');
      }),
    ).toBe('network');
    expect(
      await reason(() => {
        throw Object.assign(new Error('x'), { name: 'AbortError' });
      }),
    ).toBe('timeout');
    const net = internet({ dict: () => json({}, 429) });
    const service = judge(net);
    await service.check('thing', 'a').catch(() => {});
    await expect(service.check('thing', 'b')).rejects.toMatchObject({
      reason: 'dictionaryapi paused after http 429',
    });
  });

  test('the debug hook sees every request and the candidate counts', async () => {
    const events = [];
    const net = internet({
      search: () => json({ search: [hit('Q1', 'Sam'), hit('Q2', 'Samuel')] }),
      sparql: yes,
    });
    await judge(net, { debug: (e) => events.push(e) }).check('name', 'sam');
    expect(events.map((e) => e.step ?? e.source)).toEqual(['wikidata', 'candidates', 'wikidata']);
    expect(events[1]).toMatchObject({ hits: 2, matching: 1 });
    expect(events[0].status).toBe(200);
    const failing = [];
    const bad = internet({
      search: () => {
        throw new Error('offline');
      },
    });
    await judge(bad, { debug: (e) => failing.push(e) })
      .check('name', 'sam')
      .catch(() => {});
    expect(failing[0]).toMatchObject({ error: 'Error' });
  });
});

describe('best matches only and wait times', () => {
  test('only the three best matching candidates are examined', async () => {
    const hits = ['Q11', 'Q12', 'Q13', 'Q14', 'Q15'].map((id) => hit(id, 'Kitchen'));
    const net = internet({
      search: () => json({ search: hits }),
      sparql: () => json({ results: { bindings: [] } }),
    });
    await judge(net).check('place', 'kitchen');
    const query = net.calls[1].url.searchParams.get('query');
    expect(query).toContain('wd:Q11 wd:Q12 wd:Q13 }');
    expect(query).not.toMatch(/wd:Q14\b/);
  });

  test('a place query reaches the class by at most three fixed steps, never an open-ended walk', async () => {
    const net = internet({ search: () => json({ search: [hit('Q9', 'Sirsi')] }), sparql: yes });
    await judge(net).check('place', 'sirsi');
    const query = net.calls[1].url.searchParams.get('query');
    expect(query).not.toMatch(/P279\*/);
    expect(query).toContain('wdt:P31/wdt:P279/wdt:P279/wdt:P279');
  });

  test('a 429 tells how long to wait', async () => {
    const net = internet({ dict: () => json({}, 429, { 'retry-after': '7' }) });
    const err = await judge(net)
      .check('thing', 'table')
      .catch((e) => e);
    expect(err.retryAfterMs).toBe(7000);
    const paused = await judge(net)
      .check('thing', 'chair')
      .catch((e) => e);
    expect(paused.retryAfterMs).toBeGreaterThan(0);
  });
});

describe('animals get a dictionary second opinion', () => {
  const aMammal = [
    {
      meanings: [
        { partOfSpeech: 'noun', definitions: [{ definition: 'A large carnivorous mammal.' }] },
      ],
    },
  ];

  test('Wikidata invalid but the dictionary calls it a mammal: valid', async () => {
    const net = internet({
      search: () => json({ search: [hit('Q1', 'Wolf')] }),
      dict: () => json(aMammal),
    });
    expect(await judge(net).check('animal', 'wolf')).toEqual({
      result: 'valid',
      source: 'dictionaryapi',
    });
  });

  test('Wikidata invalid and no animal word in the dictionary: invalid', async () => {
    const net = internet({
      search: () => json({ search: [hit('Q1', 'Table')] }),
      dict: () => json(noun),
    });
    expect(await judge(net).check('animal', 'table')).toEqual({
      result: 'invalid',
      source: 'wikidata',
    });
  });

  test('Wikidata invalid and the dictionary has no entry: invalid', async () => {
    const net = internet({ search: () => json({ search: [hit('Q1', 'Zork')] }) });
    expect(await judge(net).check('animal', 'zork')).toEqual({
      result: 'invalid',
      source: 'wikidata',
    });
  });

  test('animal: Wikidata miss plus an HTML 404 is inconclusive', async () => {
    const net = internet({
      search: () => json({ search: [hit('Q1', 'Zork')] }),
      dict: () => htmlNotFound(),
    });
    expect(await judge(net).check('animal', 'zork')).toMatchObject({ result: 'inconclusive' });
  });

  test('names and animals look at ten candidates, places at three', async () => {
    const many = Array.from({ length: 12 }, (_, i) => hit(`Q${100 + i}`, 'Wolf'));
    const ask = async (category) => {
      const net = internet({ search: () => json({ search: many }), dict: () => notFound() });
      await judge(net).check(category, 'wolf');
      const query = net.calls
        .find((c) => c.url.hostname === 'query.wikidata.org')
        .url.searchParams.get('query');
      return (query.match(/wd:Q1\d\d\b/g) ?? []).length;
    };
    expect(await ask('name')).toBe(10);
    expect(await ask('animal')).toBe(10);
    expect(await ask('place')).toBe(3);
  });

  test('the dictionary step reports which parts of speech it saw', async () => {
    const events = [];
    const net = internet({
      dict: () => json([{ meanings: [{ partOfSpeech: 'verb' }, { partOfSpeech: 'adjective' }] }]),
    });
    await judge(net, { debug: (e) => events.push(e) }).check('thing', 'happy');
    expect(events.find((e) => e.step === 'meanings')).toMatchObject({
      entries: 1,
      partsOfSpeech: ['verb', 'adjective'],
    });
  });
});
