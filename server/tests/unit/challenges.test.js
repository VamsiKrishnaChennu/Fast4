import { JudgeUnavailableError } from '../../src/utils/AppErrors.js';
import { createRoomManager } from '../../src/services/roomManager.js';
import { createValidationService } from '../../src/services/validationService.js';
import { fixtureDictionary } from '../helpers/fixtures.js';
import { createFakeTimers } from '../helpers/realtimeHelpers.js';

const T = { starting: 3000, reveal: 4000, round: 60000, grace: 1500, review: 30000, result: 10000 };
const answers = (name, place, animal, thing) => ({ name, place, animal, thing });
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};

/** A judge that answers what the test tells it to and counts how often it was asked. */
function fakeJudge(defaultResult = 'valid') {
  const calls = [];
  const queue = [];
  return {
    calls,
    /** The next check gets this behaviour: a result, an Error, or 'hang'. */
    next: (behaviour) => queue.push(behaviour),
    async check(category, word) {
      calls.push({ category, word });
      const behaviour = queue.length ? queue.shift() : defaultResult;
      if (behaviour === 'hang') return new Promise(() => {});
      if (behaviour instanceof Error) throw behaviour;
      return { result: behaviour, source: 'wikidata' };
    },
  };
}

function memoryStore() {
  const calls = { challenges: [], updates: [], saved: [], finished: [] };
  return {
    calls,
    createGame: async () => 'game1',
    createRound: async (r) => `round${r.index}`,
    saveRound: async (r) => calls.saved.push(r),
    updateRound: async (r) => calls.updates.push(r),
    saveChallenge: async (c) => calls.challenges.push(c),
    finishGame: async (g) => calls.finished.push(g),
  };
}

/** Three players in a game, letter T, round 1 written and judged; the review is open. */
async function reviewing(entries, { rounds = 2 } = {}) {
  const clock = createFakeTimers();
  const sent = [];
  const judge = fakeJudge();
  const dictionary = fixtureDictionary();
  const store = memoryStore();
  const manager = createRoomManager({
    clock,
    randomInt: (max) => max - 1,
    notify: {
      room: (code, event, payload) => sent.push({ to: code, event, payload }),
      socket: (id, event, payload) => sent.push({ to: id, event, payload }),
    },
    game: {
      validation: createValidationService({ dictionary }),
      store,
      pickLetter: (used) => ['T', 'C', 'S', 'A', 'B'][used.length],
      judge,
      dictionary,
    },
  });
  const ids = ['a', 'b', 'c'];
  const make = (id) => ({ id, nickname: id.toUpperCase(), avatarColor: '#FFC247' });
  const room = manager.create({
    user: make('a'),
    socketId: 's1',
    settings: { maxPlayers: 8, rounds },
  });
  ids
    .slice(1)
    .forEach((id, i) => manager.join({ code: room.code, user: make(id), socketId: `s${i + 2}` }));
  manager.start({ userId: 'a' });
  clock.advance(T.starting + T.reveal);
  // entries: [userId, answers, 'done' | 'draft']
  for (const [userId, written, how] of entries) {
    if (how === 'done') manager.submit({ userId, roundIndex: 0, answers: written });
    else manager.draft({ userId, roundIndex: 0, answers: written });
  }
  // When everyone pressed Done the round has already ended; otherwise let the timer run out.
  if (manager.findByUser('a').phase === 'WRITING') clock.advance(T.round + T.grace);
  const view = (id = 'a') => manager.findByUser(id);
  const events = (name) => sent.filter((e) => e.event === name);
  const challenge = (userId, targetUserId, category, roundIndex = 0) =>
    manager.challenge({ userId, roundIndex, targetUserId, category });
  const row = (id) => view().review.submissions.find((s) => s.userId === id);
  const totals = () => Object.fromEntries(view().standings.map((s) => [s.userId, s.totalScore]));
  return { clock, manager, judge, dictionary, store, view, events, challenge, row, totals, sent };
}

// Hand-checked base round (letter T): A finishes first, B second, C is judged from a draft.
//   A: Tara(5, shared with C) Tokyo(5, shared with B) Tiger(5, shared by all) Table(10)  = 25 + 5 bonus = 30
//   B: Tom(10) Tokyo(5) Tiger(5) Tree(10)                                              = 30
//   C: Tara(5) Texas(10) Tiger(5) Tabel(invalid, not in the dictionary)                = 20
const base = () => [
  ['a', answers('Tara', 'Tokyo', 'Tiger', 'Table'), 'done'],
  ['b', answers('Tom', 'Tokyo', 'Tiger', 'Tree'), 'done'],
  ['c', answers('Tara', 'Texas', 'Tiger', 'Tabel'), 'draft'],
];

describe('challenges (a valid answer of someone else)', () => {
  test('overturned: the answer becomes invalid, scores and the bonus are recomputed', async () => {
    const ctx = await reviewing(base());
    expect(ctx.totals()).toEqual({ a: 30, b: 30, c: 20 });
    ctx.judge.next('invalid');
    const ack = ctx.challenge('b', 'a', 'name');
    expect(ack.type).toBe('challenge');
    expect(ctx.events('challenge:pending')).toHaveLength(1);
    expect(ctx.view().openChallenges).toHaveLength(1);
    await flush();

    const resolved = ctx.events('challenge:resolved')[0].payload;
    expect(resolved.outcome).toBe('overturned');
    expect(resolved.submission.answers.name).toMatchObject({
      verdict: 'invalid',
      source: 'challenge_invalid',
      points: 0,
    });
    // A lost "Tara": A is no longer all-valid, so the bonus moves to B. C's "Tara" is now unique.
    expect(ctx.row('a').roundScore).toBe(20);
    expect(ctx.row('b').roundScore).toBe(35);
    expect(ctx.row('c').roundScore).toBe(25);
    expect(ctx.view().review.bonusWinnerId).toBe('b');
    expect(ctx.totals()).toEqual({ a: 20, b: 35, c: 25 });
    expect(resolved.standings.map((s) => s.userId)).toEqual(['b', 'c', 'a']);
    const standing = ctx.view().standings.find((s) => s.userId === 'b');
    expect(standing.failedChallenges).toBe(0);
    expect(resolved.challengesLeft).toBe(2); // a challenge that succeeds is still one of the three
    expect(ctx.view().openChallenges).toHaveLength(0);
    expect(ctx.judge.calls).toEqual([{ category: 'name', word: 'tara' }]);
  });

  test('a word from the local dictionary that is overturned is counted for the admin', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('invalid');
    ctx.challenge('b', 'a', 'name');
    await flush();
    expect(ctx.dictionary.overturned.get('name:tara')).toBe(1);
  });

  test('upheld: the verdict stays, the initiator has one failed challenge and two left', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('valid');
    ctx.challenge('b', 'c', 'place');
    await flush();
    const resolved = ctx.events('challenge:resolved')[0].payload;
    expect(resolved).toMatchObject({ outcome: 'upheld', countsAsFailed: true, challengesLeft: 2 });
    expect(ctx.totals()).toEqual({ a: 30, b: 30, c: 20 });
    const b = ctx.view().standings.find((s) => s.userId === 'b');
    expect(b.failedChallenges).toBe(1);
    expect(ctx.view('b').challengesLeft).toBe(2);
    expect(ctx.view('c').challengesLeft).toBe(3);
  });

  test('inconclusive: the verdict stays and it counts as failed and used up', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('inconclusive');
    ctx.challenge('b', 'c', 'place');
    await flush();
    expect(ctx.events('challenge:resolved')[0].payload.outcome).toBe('inconclusive');
    expect(ctx.totals()).toEqual({ a: 30, b: 30, c: 20 });
    expect(ctx.view().standings.find((s) => s.userId === 'b').failedChallenges).toBe(1);
    expect(ctx.view('b').challengesLeft).toBe(2);
  });

  test('a failed challenge never changes a score but breaks a tie', async () => {
    // B and C are level on everything except failed challenges after C loses a challenge.
    const ctx = await reviewing([
      ['a', answers('Tara', 'Tokyo', 'Tiger', 'Table'), 'done'],
      ['b', answers('Tom', 'Tokyo', 'Tiger', 'Tree'), 'done'],
      ['c', answers('Tom', 'Tokyo', 'Tiger', 'Tree'), 'done'],
    ]);
    // Scores: A 10+5+5+10+5 = 35, B 5+5+5+5 = 20, C 20. Tied on everything, same rank.
    expect(ctx.view().standings.map((s) => s.rank)).toEqual([1, 2, 2]);
    ctx.judge.next('valid');
    ctx.challenge('b', 'a', 'name'); // upheld: B gets a failed challenge
    await flush();
    const order = ctx.view().standings.map((s) => [s.userId, s.rank, s.totalScore]);
    expect(order).toEqual([
      ['a', 1, 35],
      ['c', 2, 20],
      ['b', 3, 20],
    ]);
  });
});

describe('appeals (your own answer, rejected only because it is not in the dictionary)', () => {
  test('overturned: the answer becomes valid, the word joins the dictionary and the bonus can move back', async () => {
    // A finishes first with an unknown word; B second with all valid, so B has the bonus.
    const ctx = await reviewing([
      ['a', answers('Tara', 'Tokyo', 'Tiger', 'Tabel'), 'done'],
      ['b', answers('Tom', 'Texas', 'Tiger', 'Tree'), 'done'],
      ['c', answers('Tara', 'Tokyo', 'Tiger', 'Table'), 'done'],
    ]);
    expect(ctx.view().review.bonusWinnerId).toBe('b');
    expect(ctx.row('a').answers.thing).toMatchObject({
      verdict: 'invalid',
      reason: 'not_in_dictionary',
    });
    ctx.judge.next('valid');
    expect(ctx.challenge('a', 'a', 'thing').type).toBe('appeal');
    await flush();
    const resolved = ctx.events('challenge:resolved')[0].payload;
    expect(resolved.outcome).toBe('overturned');
    expect(ctx.row('a').answers.thing).toMatchObject({
      verdict: 'valid',
      source: 'challenge_valid',
      points: 10,
    });
    expect(ctx.view().review.bonusWinnerId).toBe('a');
    expect(ctx.row('b').firstFinisherBonus).toBe(0);
    expect(ctx.row('a').firstFinisherBonus).toBe(5);
    expect(ctx.dictionary.has('thing', 'tabel')).toBe(true);
    expect(ctx.view().standings.find((s) => s.userId === 'a').failedChallenges).toBe(0);
  });

  test('upheld: stays invalid and counts as failed for the owner', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('invalid');
    ctx.challenge('c', 'c', 'thing');
    await flush();
    expect(ctx.events('challenge:resolved')[0].payload.outcome).toBe('upheld');
    expect(ctx.row('c').answers.thing.verdict).toBe('invalid');
    expect(ctx.view().standings.find((s) => s.userId === 'c').failedChallenges).toBe(1);
    expect(ctx.dictionary.has('thing', 'tabel')).toBe(false);
  });
});

describe('what cannot be checked', () => {
  test('your own valid answer, someone else’s invalid answer, a blank, a rule failure', async () => {
    const ctx = await reviewing([
      ['a', answers('Tara', 'Tokyo', 'Tiger', 'Table'), 'done'],
      ['b', answers('Tom', 'Spain', 'Tiger', ''), 'draft'], // wrong letter place, blank thing
      ['c', answers('Tara', 'Texas', 'Tiger', 'Tabel'), 'draft'],
    ]);
    const code = (fn) => {
      try {
        fn();
      } catch (err) {
        return err.code;
      }
      return null;
    };
    expect(code(() => ctx.challenge('a', 'a', 'name'))).toBe('CHALLENGE_NOT_ALLOWED'); // own valid
    expect(code(() => ctx.challenge('a', 'c', 'thing'))).toBe('CHALLENGE_NOT_ALLOWED'); // other's invalid
    expect(code(() => ctx.challenge('b', 'b', 'thing'))).toBe('CHALLENGE_NOT_ALLOWED'); // blank
    expect(code(() => ctx.challenge('b', 'b', 'place'))).toBe('CHALLENGE_NOT_ALLOWED'); // rule failure
    expect(code(() => ctx.challenge('a', 'b', 'thing'))).toBe('CHALLENGE_NOT_ALLOWED'); // other's blank
    expect(code(() => ctx.challenge('a', 'zzz', 'name'))).toBe('CHALLENGE_NOT_ALLOWED'); // not a player
    expect(ctx.judge.calls).toHaveLength(0);
    expect(ctx.view('a').challengesLeft).toBe(3);
  });

  test('the same answer twice is a duplicate, even at the same moment and after it resolved', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('valid');
    ctx.challenge('b', 'c', 'name');
    expect(() => ctx.challenge('a', 'c', 'name')).toThrow(
      expect.objectContaining({ code: 'CHALLENGE_DUPLICATE' }),
    );
    await flush();
    expect(() => ctx.challenge('b', 'c', 'name')).toThrow(
      expect.objectContaining({ code: 'CHALLENGE_DUPLICATE' }),
    );
    expect(ctx.judge.calls).toHaveLength(1);
  });

  test('a fourth challenge or appeal is refused (appeals count)', async () => {
    const ctx = await reviewing(base());
    ctx.challenge('c', 'c', 'thing'); // appeal 1 (judge says valid and overturns, still used)
    await flush();
    ctx.challenge('c', 'a', 'name');
    ctx.challenge('c', 'a', 'place');
    await flush();
    expect(ctx.view('c').challengesLeft).toBe(0);
    expect(() => ctx.challenge('c', 'a', 'animal')).toThrow(
      expect.objectContaining({ code: 'CHALLENGE_LIMIT' }),
    );
    expect(ctx.judge.calls).toHaveLength(3);
  });

  test('challenges are refused outside the review of that round', async () => {
    const ctx = await reviewing(base());
    expect(() => ctx.challenge('b', 'a', 'name', 3)).toThrow(
      expect.objectContaining({ code: 'INVALID_PHASE' }),
    );
    ctx.clock.advance(T.review);
    expect(ctx.view().phase).toBe('ROUND_RESULT');
    expect(() => ctx.challenge('b', 'a', 'name')).toThrow(
      expect.objectContaining({ code: 'INVALID_PHASE' }),
    );
  });
});

describe('when the check cannot run', () => {
  test('an error leaves everything as it was, is not counted, and can be retried', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next(new JudgeUnavailableError(undefined, 'network'));
    ctx.challenge('b', 'a', 'name');
    await flush();
    const first = ctx.events('challenge:resolved')[0].payload;
    expect(first).toMatchObject({ outcome: 'error', challengesLeft: 3 });
    expect(ctx.totals()).toEqual({ a: 30, b: 30, c: 20 });
    expect(ctx.view().standings.find((s) => s.userId === 'b').failedChallenges).toBe(0);
    expect(ctx.view().openChallenges).toHaveLength(0);

    ctx.judge.next('invalid');
    ctx.challenge('b', 'a', 'name');
    await flush();
    expect(ctx.events('challenge:resolved')[1].payload.outcome).toBe('overturned');
    expect(ctx.judge.calls).toHaveLength(2);
  });

  test('a check that never answers times out into the same error outcome', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('hang');
    ctx.challenge('b', 'a', 'name');
    ctx.clock.advance(8000);
    await flush();
    expect(ctx.events('challenge:resolved')[0].payload.outcome).toBe('error');
    expect(ctx.view('b').challengesLeft).toBe(3);
  });
});

describe('the review waits for a pending check', () => {
  test('time up while checking: stays open and closed to new challenges, then moves on', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('hang');
    ctx.challenge('b', 'a', 'name');
    ctx.clock.advance(T.review);
    expect(ctx.view().phase).toBe('REVIEW');
    expect(ctx.view().review.closing).toBe(true);
    expect(() => ctx.challenge('c', 'a', 'place')).toThrow(
      expect.objectContaining({ code: 'INVALID_PHASE' }),
    );
    ctx.clock.advance(7000); // the check gives up
    await flush();
    expect(ctx.view().phase).toBe('ROUND_RESULT');
  });

  test('the host cannot skip while a check is running', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('hang');
    ctx.challenge('b', 'a', 'name');
    expect(() => ctx.manager.skipReview({ userId: 'a' })).toThrow(/still running/);
    ctx.clock.advance(7000);
    await flush();
    ctx.manager.skipReview({ userId: 'a' });
    expect(ctx.view().phase).toBe('ROUND_RESULT');
  });

  test('a reconnecting player sees the pending check, then the result arrives', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('hang');
    ctx.challenge('b', 'a', 'name');
    const pending = ctx.view('c').openChallenges;
    expect(pending).toEqual([
      expect.objectContaining({
        targetUserId: 'a',
        category: 'name',
        initiatorId: 'b',
        type: 'challenge',
      }),
    ]);
    ctx.clock.advance(7000);
    await flush();
    expect(ctx.view('c').openChallenges).toEqual([]);
  });
});

describe('saving', () => {
  test('changed verdicts and the challenge are written to the database', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('invalid');
    ctx.challenge('b', 'a', 'name');
    await flush();
    ctx.clock.advance(T.review);
    await flush();
    expect(ctx.store.calls.challenges).toEqual([
      expect.objectContaining({
        type: 'challenge',
        outcome: 'overturned',
        countsAsFailed: false,
        word: 'tara',
        source: 'wikidata',
      }),
    ]);
    const update = ctx.store.calls.updates.at(-1);
    expect(update.bonusWinnerId).toBe('b');
    expect(update.rows.find((r) => r.userId === 'a').answers.name.verdict).toBe('invalid');
  });

  test('totals are recomputed across rounds, not patched', async () => {
    const ctx = await reviewing(base());
    ctx.judge.next('invalid');
    ctx.challenge('b', 'a', 'name');
    await flush();
    ctx.clock.advance(T.review);
    expect(ctx.view().phase).toBe('ROUND_RESULT');
    expect(ctx.view().results.breakdown.map((b) => [b.userId, b.roundScore, b.totalScore])).toEqual(
      [
        ['a', 20, 20],
        ['b', 35, 35],
        ['c', 25, 25],
      ],
    );
  });
});
