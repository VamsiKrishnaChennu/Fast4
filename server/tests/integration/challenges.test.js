import request from 'supertest';
import { Challenge } from '../../src/models/Challenge.js';
import { DictionaryEntry } from '../../src/models/DictionaryEntry.js';
import { JudgeCache } from '../../src/models/JudgeCache.js';
import { Round } from '../../src/models/Round.js';
import { Submission } from '../../src/models/Submission.js';
import { User } from '../../src/models/User.js';
import { createDictionaryService } from '../../src/services/dictionaryService.js';
import { createMongoJudgeCache } from '../../src/services/judgeCache.js';
import { createTestApp } from '../helpers/createTestApp.js';
import { startRealtimeServer, tick } from '../helpers/realtimeHelpers.js';
import { signUp } from '../helpers/singleHelpers.js';
import { clearDb, startTestDb, stopTestDb } from '../helpers/testDb.js';

beforeAll(startTestDb, 120_000);
afterAll(stopTestDb);
beforeEach(clearDb);

const answers = (name, place, animal, thing) => ({ name, place, animal, thing });

describe('challenges over real sockets', () => {
  let rt;
  let calls;
  beforeEach(async () => {
    calls = [];
    const judge = {
      async check(category, word) {
        calls.push(`${category}:${word}`);
        return { result: word === 'tara' ? 'invalid' : 'valid', source: 'wikidata' };
      },
    };
    rt = await startRealtimeServer({ judge });
  });
  afterEach(() => rt.close());

  async function review() {
    const maya = await rt.player('Maya');
    const ben = await rt.player('Ben');
    const code = (await maya.emitAck('room:create', { settings: { maxPlayers: 8, rounds: 5 } }))
      .data.code;
    await ben.emitAck('room:join', { code });
    await maya.emitAck('game:start', {});
    rt.clock.advance(7000);
    await tick();
    await maya.emitAck('answer:submit', {
      roundIndex: 0,
      answers: answers('Tara', 'Tokyo', 'Tiger', 'Table'),
    });
    await ben.emitAck('answer:submit', {
      roundIndex: 0,
      answers: answers('Tara', 'Texas', 'Tiger', 'Tabel'),
    });
    await ben.waitFor('round:review');
    return { maya, ben };
  }

  test('pending and resolved events reach everyone and the result is saved', async () => {
    const { maya, ben } = await review();
    const ack = await ben.emitAck('challenge:create', {
      roundIndex: 0,
      targetUserId: maya.user.id,
      category: 'name',
    });
    expect(ack.ok).toBe(true);
    expect(ack.data.type).toBe('challenge');
    const pending = await maya.waitFor('challenge:pending');
    expect(pending).toMatchObject({
      targetUserId: maya.user.id,
      category: 'name',
      type: 'challenge',
    });
    const resolved = await maya.waitFor('challenge:resolved');
    expect(resolved.outcome).toBe('overturned');
    expect(resolved.submission.answers.name.verdict).toBe('invalid');
    expect(resolved.standings).toHaveLength(2);

    // Same answer again, from the other player: refused, the judge is not asked a second time.
    const again = await maya.emitAck('challenge:create', {
      roundIndex: 0,
      targetUserId: maya.user.id,
      category: 'name',
    });
    expect(again.ok).toBe(false);
    expect(again.error.code).toBe('CHALLENGE_DUPLICATE');
    expect(calls).toEqual(['name:tara']);

    rt.clock.advance(30_000);
    await ben.waitFor('round:results');
    await tick(300);
    const saved = await Challenge.findOne().lean();
    expect(saved).toMatchObject({
      type: 'challenge',
      outcome: 'overturned',
      countsAsFailed: false,
      category: 'name',
      word: 'tara',
    });
    const round = await Round.findOne({ index: 0 }).lean();
    // Maya lost her bonus, and Ben's "Tabel" is invalid, so nobody has it now.
    expect(round.bonusWinnerId).toBeNull();
    const stored = await Submission.findOne({ userId: maya.user.id }).lean();
    expect(stored.answers.name).toMatchObject({
      verdict: 'invalid',
      verdictSource: 'challenge_invalid',
    });
    expect(stored.roundScore).toBe(25);
  });

  test('bad payloads are refused', async () => {
    const { ben } = await review();
    const bad = await ben.emitAck('challenge:create', {
      roundIndex: 0,
      targetUserId: 'x',
      category: 'colour',
    });
    expect(bad.ok).toBe(false);
    expect(bad.error.code).toBe('VALIDATION_ERROR');
  });

  test('an appeal that wins adds the word to the dictionary used by later games', async () => {
    const { ben } = await review();
    const ack = await ben.emitAck('challenge:create', {
      roundIndex: 0,
      targetUserId: ben.user.id,
      category: 'thing',
    });
    expect(ack.data.type).toBe('appeal');
    const resolved = await ben.waitFor('challenge:resolved');
    expect(resolved.outcome).toBe('overturned');
    expect(resolved.submission.answers.thing.verdict).toBe('valid');
  });
});

describe('MongoDB judge cache', () => {
  test('stores a result, returns it, and ignores an expired one', async () => {
    let now = 1_000_000;
    const cache = createMongoJudgeCache({ now: () => now });
    expect(await cache.get('animal', 'cobra')).toBeNull();
    await cache.set('animal', 'cobra', {
      result: 'invalid',
      source: 'wikidata',
      checkedAt: now,
      expireAt: now + 1000,
    });
    expect(await cache.get('animal', 'cobra')).toMatchObject({
      result: 'invalid',
      source: 'wikidata',
    });
    await cache.set('animal', 'cobra', {
      result: 'valid',
      source: 'wikidata',
      checkedAt: now,
      expireAt: null,
    });
    expect(await JudgeCache.countDocuments()).toBe(1);
    expect((await cache.get('animal', 'cobra')).result).toBe('valid');
    await cache.set('animal', 'ant', {
      result: 'inconclusive',
      source: 'none',
      checkedAt: now,
      expireAt: now + 1000,
    });
    now += 2000;
    expect(await cache.get('animal', 'ant')).toBeNull();
    await cache.set('animal', 'emu', {
      result: 'inconclusive',
      source: 'none',
      checkedAt: now,
      expireAt: now + 10,
    });
    now += 20;
    expect(await cache.sweep()).toBe(1);
    expect((await cache.get('animal', 'cobra')).result).toBe('valid');
  });

  test('a database error acts like a miss', async () => {
    const cache = createMongoJudgeCache({
      model: {
        findOne: () => {
          throw new Error('down');
        },
        updateOne: async () => {
          throw new Error('down');
        },
      },
    });
    expect(await cache.get('name', 'x')).toBeNull();
    await expect(
      cache.set('name', 'x', { result: 'valid', source: 'a', checkedAt: 1, expireAt: null }),
    ).resolves.toBeUndefined();
  });
});

describe('Challenge model', () => {
  test('each answer of a round can be recorded only once', async () => {
    const id = () => new User()._id;
    const doc = {
      gameId: id(),
      roundId: id(),
      targetUserId: id(),
      initiatorId: id(),
      category: 'name',
      word: 'tara',
      type: 'challenge',
      outcome: 'upheld',
      source: 'cache',
      countsAsFailed: true,
      resolvedAt: new Date(),
    };
    await Challenge.init();
    await Challenge.create(doc);
    await expect(Challenge.create({ ...doc, initiatorId: id() })).rejects.toMatchObject({
      code: 11000,
    });
  });
});

describe('admin dictionary review', () => {
  async function setup() {
    await DictionaryEntry.insertMany([
      { category: 'name', word: 'alex', overturnedCount: 4 },
      { category: 'animal', word: 'cat', overturnedCount: 3 },
      { category: 'place', word: 'oslo', overturnedCount: 1 },
    ]);
    const dictionary = createDictionaryService();
    await dictionary.init();
    const app = createTestApp({ dictionary });
    const admin = await signUp(app, 'Boss');
    await User.updateOne({ _id: admin.user.id }, { $set: { role: 'admin' } });
    const regular = await signUp(app, 'Regular');
    return { app, admin, regular, dictionary };
  }

  test('lists overturned words, most first, with a minimum', async () => {
    const { app, admin } = await setup();
    const res = await request(app)
      .get('/api/admin/dictionary/overturned?min=3')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => [e.category, e.word, e.overturnedCount])).toEqual([
      ['name', 'alex', 4],
      ['animal', 'cat', 3],
    ]);
    const all = await request(app)
      .get('/api/admin/dictionary/overturned?min=1')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(all.body.entries).toHaveLength(3);
    const bad = await request(app)
      .get('/api/admin/dictionary/overturned?min=abc')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(bad.status).toBe(400);
  });

  test('removes an entry from the database and from memory', async () => {
    const { app, admin, dictionary } = await setup();
    expect(dictionary.has('name', 'alex')).toBe(true);
    const res = await request(app)
      .delete('/api/admin/dictionary/name/alex')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(204);
    expect(dictionary.has('name', 'alex')).toBe(false);
    expect(await DictionaryEntry.countDocuments({ word: 'alex' })).toBe(0);
  });

  test('only admins can use it', async () => {
    const { app, regular } = await setup();
    const anon = await request(app).get('/api/admin/dictionary/overturned');
    expect(anon.status).toBe(401);
    const denied = await request(app)
      .get('/api/admin/dictionary/overturned')
      .set('Authorization', `Bearer ${regular.token}`);
    expect(denied.status).toBe(403);
    const del = await request(app)
      .delete('/api/admin/dictionary/name/alex')
      .set('Authorization', `Bearer ${regular.token}`);
    expect(del.status).toBe(403);
  });
});

describe('dictionaryService challenge helpers', () => {
  test('markOverturned counts, and a won appeal is saved as an external word', async () => {
    await DictionaryEntry.create({ category: 'name', word: 'alex' });
    const dictionary = createDictionaryService();
    await dictionary.init();
    await dictionary.markOverturned('name', 'alex');
    await dictionary.markOverturned('name', 'alex');
    expect((await DictionaryEntry.findOne({ word: 'alex' }).lean()).overturnedCount).toBe(2);
    await dictionary.add('thing', 'tabel');
    expect(dictionary.has('thing', 'tabel')).toBe(true);
    expect((await DictionaryEntry.findOne({ word: 'tabel' }).lean()).source).toBe('external');
  });
});
