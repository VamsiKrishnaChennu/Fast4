import { createRoomManager } from '../../src/services/roomManager.js';
import { createValidationService } from '../../src/services/validationService.js';
import { fixtureDictionary } from '../helpers/fixtures.js';
import { createFakeTimers } from '../helpers/realtimeHelpers.js';

const T = { starting: 3000, reveal: 4000, round: 60000, grace: 1500, review: 30000, result: 10000 };

/** A store that only remembers what it was asked to save. */
function memoryStore() {
  const calls = { games: [], rounds: [], saved: [], finished: [] };
  return {
    calls,
    createGame: async (g) => {
      calls.games.push(g);
      return 'game1';
    },
    createRound: async (r) => {
      calls.rounds.push(r);
      return `round${r.index}`;
    },
    saveRound: async (r) => calls.saved.push(r),
    finishGame: async (g) => calls.finished.push(g),
  };
}

function setup({ rounds = 5, users = 3, letters = ['T', 'C', 'S', 'A', 'B'], store } = {}) {
  const clock = createFakeTimers();
  const sent = [];
  const theStore = store ?? memoryStore();
  const manager = createRoomManager({
    clock,
    randomInt: (max) => max - 1,
    notify: {
      room: (code, event, payload) => sent.push({ to: code, event, payload }),
      socket: (id, event, payload) => sent.push({ to: id, event, payload }),
    },
    game: {
      validation: createValidationService({ dictionary: fixtureDictionary() }),
      store: theStore,
      pickLetter: (used) => letters[used.length],
    },
  });
  const ids = Array.from({ length: users }, (_, i) => `p${i + 1}`);
  const make = (id) => ({ id, nickname: `Name${id}`, avatarColor: '#FFC247' });
  const room = manager.create({
    user: make(ids[0]),
    socketId: 's1',
    settings: { maxPlayers: 8, rounds },
  });
  ids
    .slice(1)
    .forEach((id, i) => manager.join({ code: room.code, user: make(id), socketId: `s${i + 2}` }));
  const events = (name) => sent.filter((e) => e.event === name);
  const state = (id = ids[0]) => manager.findByUser(id);
  return { manager, clock, ids, code: room.code, sent, events, store: theStore, state, make };
}

const answers = (name, place, animal, thing) => ({ name, place, animal, thing });
const flush = () => new Promise((r) => setImmediate(r));

/** Moves from the end of the previous phase to the start of writing in the next round. */
function toWriting(ctx, { first = false } = {}) {
  if (first) ctx.clock.advance(T.starting);
  ctx.clock.advance(T.reveal);
}

describe('a full five-round game with three players', () => {
  test('scores match the hand calculation and the game completes', async () => {
    const ctx = setup();
    const [a, b, c] = ctx.ids;
    const { manager, clock } = ctx;
    manager.start({ userId: a });
    expect(ctx.state().phase).toBe('STARTING');
    toWriting(ctx, { first: true });
    expect(ctx.state().phase).toBe('WRITING');

    // Round 1, letter T: A finishes first, B second, C never presses Done (draft is used).
    manager.submit({
      userId: a,
      roundIndex: 0,
      ...{ answers: answers('Tara', 'Tokyo', 'Tiger', 'Table') },
    });
    manager.submit({ userId: b, roundIndex: 0, answers: answers('Tom', 'Tokyo', 'Tiger', 'Tree') });
    manager.draft({
      userId: c,
      roundIndex: 0,
      answers: answers('Tara', 'Texas', 'Tiger', 'Tabel'),
    });
    clock.advance(T.round); // time is up
    expect(ctx.state().phase).toBe('COLLECTING');
    clock.advance(T.grace);
    expect(ctx.state().phase).toBe('REVIEW');
    const results = ctx.state().review.submissions;
    expect(results.map((s) => s.roundScore)).toEqual([30, 30, 20]);
    expect(ctx.state().review.bonusWinnerId).toBe(a);
    clock.advance(T.review);
    expect(ctx.state().phase).toBe('ROUND_RESULT');
    expect(ctx.state().standings.map((s) => [s.userId, s.totalScore])).toEqual([
      [b, 30], // level with A on points, ahead on unique answers (2 to 1)
      [a, 30],
      [c, 20],
    ]);
    clock.advance(T.result);
    toWriting(ctx);

    // Round 2, letter C: everyone presses Done, so the round ends at once. B is first.
    manager.submit({ userId: b, roundIndex: 1, answers: answers('Cy', 'Chile', 'Cow', 'Chair') });
    manager.submit({ userId: a, roundIndex: 1, answers: answers('Chris', 'Canada', 'Cat', 'Cup') });
    expect(ctx.state().phase).toBe('WRITING');
    manager.submit({
      userId: c,
      roundIndex: 1,
      answers: answers('Carl', 'China', 'Cobra', 'Clock'),
    });
    expect(ctx.state().phase).toBe('REVIEW');
    expect(ctx.state().review.submissions.map((s) => s.roundScore)).toEqual([40, 45, 40]);
    clock.advance(T.review + T.result);
    toWriting(ctx);

    // Round 3, letter S: only A presses Done; B has a draft; C wrote nothing.
    manager.submit({ userId: a, roundIndex: 2, answers: answers('Sam', 'Spain', 'Seal', 'Sofa') });
    manager.draft({ userId: b, roundIndex: 2, answers: answers('Sara', 'Spain', 'Snake', 'Sock') });
    clock.advance(T.round + T.grace);
    expect(ctx.state().review.submissions.map((s) => s.roundScore)).toEqual([40, 35, 0]);
    clock.advance(T.review + T.result);
    toWriting(ctx);

    // Round 4, letter A: B finishes first, A second.
    manager.submit({
      userId: b,
      roundIndex: 3,
      answers: answers('Alex', 'Albania', 'Ape', 'Apple'),
    });
    manager.submit({
      userId: a,
      roundIndex: 3,
      answers: answers('Alex', 'Albania', 'Ant', 'Apple'),
    });
    manager.draft({ userId: c, roundIndex: 3, answers: answers('Amy', 'Ankara', 'Ape', 'Apple') });
    clock.advance(T.round + T.grace);
    expect(ctx.state().review.submissions.map((s) => s.roundScore)).toEqual([25, 25, 30]);
    clock.advance(T.review + T.result);
    toWriting(ctx);

    // Round 5, letter B: A and B press Done but neither has four valid answers: no bonus.
    manager.submit({ userId: a, roundIndex: 4, answers: answers('Ben', 'Boston', 'Bear', 'Bus') });
    manager.submit({ userId: b, roundIndex: 4, answers: answers('Ben', 'Boston', 'Bat', 'Bus') });
    manager.draft({ userId: c, roundIndex: 4, answers: answers('Bella', '', 'Bat', 'Book') });
    clock.advance(T.round + T.grace);
    expect(ctx.state().review.bonusWinnerId).toBeNull();
    expect(ctx.state().review.submissions.map((s) => s.roundScore)).toEqual([20, 15, 25]);
    clock.advance(T.review);
    expect(ctx.state().results.isLast).toBe(true);
    clock.advance(T.result);
    await flush();

    const over = ctx.state();
    expect(over.phase).toBe('GAME_OVER');
    expect(over.status).toBe('finished');
    expect(over.gameOver.standings.map((s) => [s.userId, s.totalScore, s.rank])).toEqual([
      [a, 155, 1],
      [b, 150, 2],
      [c, 115, 3],
    ]);
    expect(over.gameOver.winnerIds).toEqual([a]);
    expect(over.gameOver.stats[a]).toEqual({
      uniqueAnswers: 10,
      firstFinisherCount: 2, // round 1 and round 3
      failedChallenges: 0,
    });
    expect(over.gameOver.stats[b]).toEqual({
      uniqueAnswers: 9,
      firstFinisherCount: 2,
      failedChallenges: 0,
    });
    expect(over.gameOver.stats[c]).toEqual({
      uniqueAnswers: 9,
      firstFinisherCount: 0,
      failedChallenges: 0,
    });
    expect(over.players.map((p) => p.score)).toEqual([155, 150, 115]);

    expect(ctx.events('game:over')).toHaveLength(1);
    expect(ctx.events('round:toss')).toHaveLength(5);
    expect(ctx.events('round:review')).toHaveLength(5);
    expect(ctx.events('round:results')).toHaveLength(5);
    expect(ctx.store.calls.games).toHaveLength(1);
    expect(ctx.store.calls.rounds.map((r) => r.letter)).toEqual(['T', 'C', 'S', 'A', 'B']);
    expect(ctx.store.calls.saved).toHaveLength(5);
    expect(ctx.store.calls.saved[0].bonusWinnerId).toBe(a);
    expect(ctx.store.calls.finished[0]).toMatchObject({
      status: 'finished',
      winnerIds: [a],
      letters: ['T', 'C', 'S', 'A', 'B'],
      updateStats: true,
    });
  });
});

describe('letters, drafts and privacy', () => {
  test('the toss event and snapshot carry no letter; writing does', () => {
    const ctx = setup();
    ctx.manager.start({ userId: ctx.ids[0] });
    ctx.clock.advance(T.starting);
    expect(ctx.state().phase).toBe('LETTER_TOSS');
    expect(ctx.events('round:toss')[0].payload).toEqual({
      index: 0,
      startsAt: expect.any(Number),
      revealAt: expect.any(Number),
    });
    expect(JSON.stringify(ctx.events('room:state').at(-1).payload)).not.toContain('"letter"');
    expect(ctx.state().round.letter).toBeUndefined();
    ctx.clock.advance(T.reveal);
    const started = ctx.events('round:started')[0].payload;
    expect(started).toMatchObject({ index: 0, letter: 'T', endsAt: ctx.clock.now() + T.round });
    expect(ctx.state().round).toMatchObject({ letter: 'T', endsAt: started.endsAt });
  });

  test('no other player answers appear before the review', () => {
    const ctx = setup();
    const [a, b] = ctx.ids;
    ctx.manager.start({ userId: a });
    toWriting(ctx, { first: true });
    ctx.manager.submit({
      userId: a,
      roundIndex: 0,
      answers: answers('Tara', 'Tokyo', 'Tiger', 'Table'),
    });
    ctx.manager.draft({
      userId: b,
      roundIndex: 0,
      answers: answers('Tom', 'Texas', 'Tiger', 'Tree'),
    });
    // Everything the room and the other player (b, on socket s2) received.
    const seen = JSON.stringify(ctx.sent.filter((e) => e.to === ctx.code || e.to === 's2'));
    expect(seen).not.toMatch(/Tara|Tokyo|Table/);
    expect(JSON.stringify(ctx.sent.filter((e) => e.to === 's1'))).not.toMatch(/Texas/);
    expect(ctx.events('round:playerFinished')[0].payload).toEqual({ userId: a, order: 1 });
    expect(ctx.state(a).myDraft).toEqual(answers('Tara', 'Tokyo', 'Tiger', 'Table'));
    expect(ctx.state(a).mySubmitted).toBe(true);
    expect(ctx.state(b).mySubmitted).toBe(false);
  });

  test('drafts outside writing, for the wrong round or after Done are ignored', () => {
    const ctx = setup();
    const [a] = ctx.ids;
    ctx.manager.start({ userId: a });
    ctx.manager.draft({ userId: a, roundIndex: 0, answers: answers('x', 'x', 'x', 'x') });
    toWriting(ctx, { first: true });
    ctx.manager.draft({ userId: a, roundIndex: 3, answers: answers('Tara', '', '', '') });
    expect(ctx.state(a).myDraft).toEqual(answers('', '', '', ''));
    ctx.manager.draft({ userId: a, roundIndex: 0, answers: answers('Tara', '', '', '') });
    expect(ctx.state(a).myDraft.name).toBe('Tara');
    ctx.manager.submit({
      userId: a,
      roundIndex: 0,
      answers: answers('Tom', 'Tokyo', 'Tiger', 'Table'),
    });
    ctx.manager.draft({ userId: a, roundIndex: 0, answers: answers('Changed', '', '', '') });
    expect(ctx.state(a).myDraft.name).toBe('Tom');
  });
});

describe('submitting', () => {
  const full = answers('Tara', 'Tokyo', 'Tiger', 'Table');

  test('a repeated Done returns the same result and counts once', () => {
    const ctx = setup();
    ctx.manager.start({ userId: ctx.ids[0] });
    toWriting(ctx, { first: true });
    const first = ctx.manager.submit({ userId: ctx.ids[0], roundIndex: 0, answers: full });
    const again = ctx.manager.submit({
      userId: ctx.ids[0],
      roundIndex: 0,
      answers: answers('Tom', 'Texas', 'Tiger', 'Tree'),
    });
    expect(first).toEqual({ finishOrder: 1 });
    expect(again).toEqual({ finishOrder: 1 });
    expect(ctx.events('round:playerFinished')).toHaveLength(1);
    ctx.manager.submit({ userId: ctx.ids[1], roundIndex: 0, answers: full });
    expect(ctx.events('round:playerFinished').map((e) => e.payload.order)).toEqual([1, 2]);
  });

  test('needs all four answers and rejects blanks', () => {
    const ctx = setup();
    ctx.manager.start({ userId: ctx.ids[0] });
    toWriting(ctx, { first: true });
    expect(() =>
      ctx.manager.submit({
        userId: ctx.ids[0],
        roundIndex: 0,
        answers: answers('Tara', ' ', 'Tiger', 'Table'),
      }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  test('not allowed during the toss, and no game means no submit', () => {
    const ctx = setup();
    expect(() => ctx.manager.submit({ userId: ctx.ids[0], roundIndex: 0, answers: full })).toThrow(
      expect.objectContaining({ code: 'INVALID_PHASE' }),
    );
    ctx.manager.start({ userId: ctx.ids[0] });
    ctx.clock.advance(T.starting);
    expect(() => ctx.manager.submit({ userId: ctx.ids[0], roundIndex: 0, answers: full })).toThrow(
      expect.objectContaining({ code: 'INVALID_PHASE' }),
    );
  });

  test('a late Done inside the grace period counts; after it the round has expired', () => {
    const ctx = setup();
    const [a, b, c] = ctx.ids;
    ctx.manager.start({ userId: a });
    toWriting(ctx, { first: true });
    ctx.manager.submit({ userId: a, roundIndex: 0, answers: full });
    ctx.clock.advance(T.round);
    expect(ctx.state().phase).toBe('COLLECTING');
    ctx.clock.advance(500);
    expect(
      ctx.manager.submit({
        userId: b,
        roundIndex: 0,
        answers: answers('Tom', 'Tokyo', 'Tiger', 'Tree'),
      }),
    ).toEqual({
      finishOrder: 2,
    });
    ctx.clock.advance(T.grace);
    expect(ctx.state().phase).toBe('REVIEW');
    expect(ctx.state().review.submissions.find((s) => s.userId === b).answers.name.raw).toBe('Tom');
    expect(() => ctx.manager.submit({ userId: c, roundIndex: 0, answers: full })).toThrow(
      expect.objectContaining({ code: 'ROUND_EXPIRED' }),
    );
  });
});

describe('review and results', () => {
  test('only the host can skip the review, and it ends it at once', () => {
    const ctx = setup();
    const [a, b] = ctx.ids;
    ctx.manager.start({ userId: a });
    toWriting(ctx, { first: true });
    ctx.clock.advance(T.round + T.grace);
    expect(() => ctx.manager.skipReview({ userId: b })).toThrow(
      expect.objectContaining({ code: 'NOT_HOST' }),
    );
    ctx.manager.skipReview({ userId: a });
    expect(ctx.state().phase).toBe('ROUND_RESULT');
    expect(() => ctx.manager.skipReview({ userId: a })).toThrow(
      expect.objectContaining({ code: 'INVALID_PHASE' }),
    );
    // The old review timer must not fire a second time.
    ctx.clock.advance(T.review);
    expect(ctx.events('round:results')).toHaveLength(1);
  });

  test('results show the previous rank so the screen can show movement', () => {
    const ctx = setup();
    const [a, b, c] = ctx.ids;
    ctx.manager.start({ userId: a });
    toWriting(ctx, { first: true });
    ctx.manager.submit({
      userId: a,
      roundIndex: 0,
      answers: answers('Tara', 'Tokyo', 'Tiger', 'Table'),
    });
    ctx.manager.submit({
      userId: b,
      roundIndex: 0,
      answers: answers('Tom', 'Tokyo', 'Tiger', 'Tree'),
    });
    ctx.manager.submit({
      userId: c,
      roundIndex: 0,
      answers: answers('Tara', 'Texas', 'Tiger', 'Table'),
    });
    expect(ctx.state().phase).toBe('REVIEW');
    ctx.clock.advance(T.review);
    const { breakdown, isLast } = ctx.events('round:results')[0].payload;
    expect(isLast).toBe(false);
    expect(breakdown.find((r) => r.userId === a)).toMatchObject({
      answerPoints: { name: 5, place: 5, animal: 5, thing: 5 },
      firstFinisherBonus: 5,
      roundScore: 25,
      totalScore: 25,
      previousRank: 1,
      rank: 3,
    });
  });
});

describe('players coming and going', () => {
  test('a reconnecting player gets the full state with their own draft', () => {
    const ctx = setup();
    const [a, b] = ctx.ids;
    ctx.manager.start({ userId: a });
    toWriting(ctx, { first: true });
    ctx.manager.draft({ userId: b, roundIndex: 0, answers: answers('Tom', 'Tok', '', '') });
    ctx.manager.disconnect({ userId: b, socketId: 's2' });
    ctx.clock.advance(10_000);
    const { room, rejoined } = ctx.manager.join({
      code: ctx.code,
      user: ctx.make(b),
      socketId: 's9',
    });
    expect(rejoined).toBe(true);
    expect(room).toMatchObject({
      phase: 'WRITING',
      myDraft: answers('Tom', 'Tok', '', ''),
      round: { index: 0, letter: 'T' },
    });
    const own = ctx.sent.filter((e) => e.to === 's9' && e.event === 'room:state').at(-1);
    expect(own.payload.myDraft.name).toBe('Tom');
    // Other players only ever get their own draft.
    const other = ctx.sent.filter((e) => e.to === 's1' && e.event === 'room:state').at(-1);
    expect(other.payload.myDraft).toEqual(answers('', '', '', ''));
  });

  test('the round ends early when everyone still connected has pressed Done', () => {
    const ctx = setup();
    const [a, b, c] = ctx.ids;
    ctx.manager.start({ userId: a });
    toWriting(ctx, { first: true });
    ctx.manager.disconnect({ userId: c, socketId: 's3' });
    ctx.manager.submit({
      userId: a,
      roundIndex: 0,
      answers: answers('Tara', 'Tokyo', 'Tiger', 'Table'),
    });
    expect(ctx.state().phase).toBe('WRITING');
    ctx.manager.submit({
      userId: b,
      roundIndex: 0,
      answers: answers('Tom', 'Tokyo', 'Tiger', 'Tree'),
    });
    expect(ctx.state().phase).toBe('REVIEW');
  });

  test('a player who leaves keeps their score in the standings', () => {
    const ctx = setup();
    const [a, , c] = ctx.ids;
    ctx.manager.start({ userId: a });
    toWriting(ctx, { first: true });
    ctx.manager.draft({
      userId: c,
      roundIndex: 0,
      answers: answers('Tara', 'Texas', 'Tiger', 'Table'),
    });
    ctx.manager.leave({ userId: c });
    ctx.clock.advance(T.round + T.grace);
    const standing = ctx.state().standings.find((s) => s.userId === c);
    expect(standing).toMatchObject({ left: true, totalScore: 40 });
  });

  test('with fewer than two connected players the game ends after the wait', async () => {
    const ctx = setup({ users: 2 });
    const [a, b] = ctx.ids;
    ctx.manager.start({ userId: a });
    toWriting(ctx, { first: true });
    ctx.manager.submit({
      userId: a,
      roundIndex: 0,
      answers: answers('Tara', 'Tokyo', 'Tiger', 'Table'),
    });
    ctx.clock.advance(T.round + T.grace);
    ctx.manager.disconnect({ userId: b, socketId: 's2' });
    ctx.clock.advance(29_000);
    expect(ctx.state().phase).not.toBe('GAME_OVER');
    ctx.clock.advance(2000);
    await flush();
    expect(ctx.state().phase).toBe('GAME_OVER');
    expect(ctx.state().gameOver.reason).toBe('alone');
    expect(ctx.state().gameOver.winnerIds).toEqual([a]);
    expect(ctx.store.calls.finished[0]).toMatchObject({ status: 'finished', updateStats: true });
  });

  test('the wait is cancelled when the player comes back', () => {
    const ctx = setup({ users: 2 });
    const [a, b] = ctx.ids;
    ctx.manager.start({ userId: a });
    ctx.manager.disconnect({ userId: b, socketId: 's2' });
    ctx.clock.advance(20_000);
    ctx.manager.join({ code: ctx.code, user: ctx.make(b), socketId: 's5' });
    ctx.clock.advance(60_000);
    expect(ctx.state().phase).not.toBe('GAME_OVER');
  });

  test('a game that ends before any round was judged is saved as abandoned with no stats', async () => {
    const ctx = setup({ users: 2 });
    const [a, b] = ctx.ids;
    ctx.manager.start({ userId: a });
    ctx.manager.disconnect({ userId: b, socketId: 's2' });
    ctx.clock.advance(31_000);
    await flush();
    expect(ctx.store.calls.finished[0]).toMatchObject({
      status: 'abandoned',
      updateStats: false,
      winnerIds: [],
    });
  });
});

describe('after the game', () => {
  async function finished() {
    const ctx = setup({ rounds: 5, users: 2 });
    const [a, b] = ctx.ids;
    ctx.manager.start({ userId: a });
    toWriting(ctx, { first: true });
    for (let i = 0; i < 5; i += 1) {
      ctx.clock.advance(T.round + T.grace + T.review + T.result);
      if (i < 4) toWriting(ctx);
    }
    await flush();
    return { ctx, a, b };
  }

  test('only the host can play again; it returns everyone to a fresh lobby', async () => {
    const { ctx, a, b } = await finished();
    expect(ctx.state().phase).toBe('GAME_OVER');
    expect(() => ctx.manager.playAgain({ userId: b })).toThrow(
      expect.objectContaining({ code: 'NOT_HOST' }),
    );
    ctx.manager.leave({ userId: b });
    const room = ctx.manager.playAgain({ userId: a });
    expect(room).toMatchObject({ phase: 'LOBBY', status: 'lobby' });
    expect(room.players.map((p) => p.userId)).toEqual([a]);
    expect(room.players[0].score).toBe(0);
    expect(room.standings).toEqual([]);
  });

  test('play again is refused while a game is running', () => {
    const ctx = setup();
    ctx.manager.start({ userId: ctx.ids[0] });
    expect(() => ctx.manager.playAgain({ userId: ctx.ids[0] })).toThrow(
      expect.objectContaining({ code: 'INVALID_PHASE' }),
    );
  });

  test('a second game can start in the same room', async () => {
    const { ctx, a } = await finished();
    ctx.manager.playAgain({ userId: a });
    ctx.manager.start({ userId: a });
    expect(ctx.state().phase).toBe('STARTING');
    expect(ctx.state().standings.every((s) => s.totalScore === 0)).toBe(true);
  });
});

describe('when saving fails', () => {
  test('the game carries on', async () => {
    const failing = {
      createGame: async () => {
        throw new Error('db down');
      },
      createRound: async () => 'r',
      saveRound: async () => {
        throw new Error('db down');
      },
      finishGame: async () => {
        throw new Error('db down');
      },
    };
    const ctx = setup({ rounds: 5, users: 2, store: failing });
    ctx.manager.start({ userId: ctx.ids[0] });
    toWriting(ctx, { first: true });
    for (let i = 0; i < 5; i += 1) {
      ctx.clock.advance(T.round + T.grace + T.review + T.result);
      if (i < 4) toWriting(ctx);
    }
    await flush();
    expect(ctx.state().phase).toBe('GAME_OVER');
  });
});
