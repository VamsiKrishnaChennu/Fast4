import { LETTER_POOL } from '@fastfour/shared';
import { Game } from '../../src/models/Game.js';
import { Submission } from '../../src/models/Submission.js';
import { User } from '../../src/models/User.js';
import { clearDb, startTestDb, stopTestDb } from '../helpers/testDb.js';
import {
  ANSWERS,
  authed,
  createFakeClock,
  createSingleApp,
  playGame,
  signUp,
} from '../helpers/singleHelpers.js';

let app;
let clock;
let maya;
let api;

beforeAll(startTestDb, 120_000);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearDb();
  ({ app, clock } = createSingleApp());
  maya = await signUp(app, 'Maya');
  api = authed(app, maya.token);
});

const startGame = async (rounds = 5) => (await api.post('/api/single/games').send({ rounds })).body;
const nextRound = async (gameId) =>
  (await api.post(`/api/single/games/${gameId}/rounds/next`)).body;
const submit = (gameId, index, answers) =>
  api.post(`/api/single/games/${gameId}/rounds/${index}/submit`).send({ answers });
/** Moves the clock to `seconds` after writing started for this round. */
const at = (round, seconds) => {
  clock.t = new Date(round.startedAt).getTime() + seconds * 1000;
};

describe('creating a game', () => {
  test.each([5, 10, 15, 20])('%i rounds is accepted and no letter is revealed', async (rounds) => {
    const res = await api.post('/api/single/games').send({ rounds });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ gameId: expect.any(String), rounds, roundSeconds: 60 });
    expect(JSON.stringify(res.body)).not.toMatch(/letter/i);
  });

  test.each([7, 25, '10', null, 0])('%p rounds is rejected', async (rounds) => {
    const res = await api.post('/api/single/games').send({ rounds });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects unknown fields', async () => {
    expect((await api.post('/api/single/games').send({ rounds: 5, extra: 1 })).status).toBe(400);
  });

  test('needs a signed-in user', async () => {
    const res = await authed(app, 'nope').post('/api/single/games').send({ rounds: 5 });
    expect(res.status).toBe(401);
  });

  test('starting a new game abandons the previous active one', async () => {
    const first = await startGame();
    const second = await startGame();
    expect((await Game.findById(first.gameId)).status).toBe('abandoned');
    expect((await Game.findById(second.gameId)).status).toBe('in_progress');
  });
});

describe('rounds', () => {
  test('next returns a letter from the pool and a 60 second window that starts after the toss', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    expect(LETTER_POOL).toContain(round.letter);
    expect(round.index).toBe(0);
    const start = new Date(round.startedAt).getTime();
    expect(start - round.serverNow).toBe(4000);
    expect(new Date(round.endsAt).getTime() - start).toBe(60_000);
  });

  test('asking again for the open round returns the same round (reload)', async () => {
    const game = await startGame();
    const a = await nextRound(game.gameId);
    clock.advance(10_000);
    const b = await nextRound(game.gameId);
    expect(b).toMatchObject({
      index: 0,
      letter: a.letter,
      startedAt: a.startedAt,
      endsAt: a.endsAt,
    });
  });

  test('letters never repeat within a game', async () => {
    const game = await startGame(5);
    const letters = [];
    for (let i = 0; i < 5; i += 1) {
      const round = await nextRound(game.gameId);
      letters.push(round.letter);
      at(round, 5);
      await submit(game.gameId, round.index, ANSWERS[round.letter]);
    }
    expect(new Set(letters).size).toBe(5);
  });

  test('cannot start a round after the last one', async () => {
    const { gameId } = await playGame({ app, clock, token: maya.token });
    const res = await api.post(`/api/single/games/${gameId}/rounds/next`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_PHASE');
  });
});

describe('submitting', () => {
  test.each([
    ['all valid with 60 s left', 0, 50],
    ['all valid with 31 s left', 29, 46],
    ['all valid at the deadline', 60, 40],
  ])('%s scores %i', async (_label, seconds, expected) => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, seconds);
    const res = await submit(game.gameId, 0, ANSWERS.T);
    expect(res.status).toBe(200);
    expect(res.body.roundScore).toBe(expected);
    expect(res.body.totalScore).toBe(expected);
    expect(res.body.isLast).toBe(false);
    expect(res.body.points).toEqual({ name: 10, place: 10, animal: 10, thing: 10 });
    expect(res.body.verdicts.name).toMatchObject({ raw: 'Tara', verdict: 'valid' });
  });

  test('three valid and one invalid gets no time bonus', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, 30);
    const res = await submit(game.gameId, 0, { ...ANSWERS.T, thing: 'Zebra' });
    expect(res.body.roundScore).toBe(30);
    expect(res.body.timeBonus).toBe(0);
    expect(res.body.verdicts.thing).toMatchObject({
      verdict: 'invalid',
      reason: expect.any(String),
    });
  });

  test('wrong first letter is invalid and blanks score zero', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, 30);
    const res = await submit(game.gameId, 0, { name: 'Alex', place: '', animal: '', thing: '' });
    expect(res.body.roundScore).toBe(0);
    expect(res.body.verdicts.name.verdict).toBe('invalid');
    expect(res.body.verdicts.place.verdict).toBe('blank');
  });

  test('missing answer keys count as blank', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, 5);
    const res = await submit(game.gameId, 0, { name: 'Tara' });
    expect(res.status).toBe(200);
    expect(res.body.roundScore).toBe(10);
  });

  test('rejects unknown answer keys and oversized text', async () => {
    const game = await startGame();
    await nextRound(game.gameId);
    expect((await submit(game.gameId, 0, { color: 'red' })).status).toBe(400);
    expect((await submit(game.gameId, 0, { name: 'x'.repeat(101) })).status).toBe(400);
  });

  test('accepted up to 1.5 s after the deadline, but earns no time bonus', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, 61.4);
    const res = await submit(game.gameId, 0, ANSWERS.T);
    expect(res.status).toBe(200);
    expect(res.body.roundScore).toBe(40);
  });

  test('after the grace period the round is scored zero and ROUND_EXPIRED is returned', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, 61.6);
    const res = await submit(game.gameId, 0, ANSWERS.T);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROUND_EXPIRED');
    const state = (await api.get(`/api/single/games/${game.gameId}`)).body;
    expect(state.totalScore).toBe(0);
    expect(state.results[0]).toMatchObject({ roundScore: 0, missed: true });
    // the game carries on
    const next = await nextRound(game.gameId);
    expect(next.index).toBe(1);
  });

  test('submitting twice returns the same result and does not double count', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, 29);
    const a = await submit(game.gameId, 0, ANSWERS.T);
    const b = await submit(game.gameId, 0, { name: 'Tom', place: '', animal: '', thing: '' });
    expect(b.status).toBe(200);
    expect(b.body.roundScore).toBe(a.body.roundScore);
    expect(b.body.totalScore).toBe(a.body.totalScore);
    expect(await Submission.countDocuments({ gameId: game.gameId })).toBe(1);
  });

  test('two submits at the same moment still score once', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, 20);
    const [a, b] = await Promise.all([
      submit(game.gameId, 0, ANSWERS.T),
      submit(game.gameId, 0, ANSWERS.T),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await Submission.countDocuments({ gameId: game.gameId })).toBe(1);
  });

  test('a round that has not started cannot be submitted', async () => {
    const game = await startGame();
    const res = await submit(game.gameId, 3, ANSWERS.T);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_PHASE');
  });

  test('a bad game id or round index is a validation error', async () => {
    expect((await api.get('/api/single/games/not-an-id')).status).toBe(400);
    const game = await startGame();
    expect((await submit(game.gameId, 'x', ANSWERS.T)).status).toBe(400);
  });
});

describe('who can see a game', () => {
  test("another player cannot read, start rounds in, submit to or quit someone else's game", async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    const ben = await signUp(app, 'Ben');
    const other = authed(app, ben.token);
    expect((await other.get(`/api/single/games/${game.gameId}`)).status).toBe(404);
    expect((await other.post(`/api/single/games/${game.gameId}/rounds/next`)).status).toBe(404);
    at(round, 5);
    expect(
      (
        await other
          .post(`/api/single/games/${game.gameId}/rounds/0/submit`)
          .send({ answers: ANSWERS.T })
      ).status,
    ).toBe(404);
    expect((await other.post(`/api/single/games/${game.gameId}/quit`)).status).toBe(404);
  });

  test('an unknown game id is 404', async () => {
    expect((await api.get('/api/single/games/aaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
  });
});

describe('resuming and quitting', () => {
  test('GET during a round returns the open round with its deadline', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    clock.advance(20_000);
    const res = await api.get(`/api/single/games/${game.gameId}`);
    expect(res.body).toMatchObject({
      status: 'in_progress',
      rounds: 5,
      totalScore: 0,
      results: [],
      round: { index: 0, letter: round.letter, endsAt: round.endsAt },
    });
    expect(res.body.serverNow).toBe(clock.now());
  });

  test('GET between rounds has no open round and lists finished ones', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, 29);
    await submit(game.gameId, 0, ANSWERS.T);
    const res = await api.get(`/api/single/games/${game.gameId}`);
    expect(res.body.round).toBeNull();
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({ index: 0, roundScore: 46, timeBonus: 6 });
    expect(res.body.totalScore).toBe(46);
  });

  test('GET after a missed round scores it zero and allows continuing', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, 90);
    const res = await api.get(`/api/single/games/${game.gameId}`);
    expect(res.body.round).toBeNull();
    expect(res.body.results[0]).toMatchObject({ roundScore: 0, missed: true });
    expect((await nextRound(game.gameId)).index).toBe(1);
  });

  test('a missed final round finishes the game', async () => {
    const game = await startGame(5);
    for (let i = 0; i < 5; i += 1) {
      const round = await nextRound(game.gameId);
      at(round, 100);
    }
    const res = await api.get(`/api/single/games/${game.gameId}`);
    expect(res.body.status).toBe('finished');
    expect(res.body.totalScore).toBe(0);
  });

  test('quit abandons the game and repeated quits are harmless', async () => {
    const game = await startGame();
    const res = await api.post(`/api/single/games/${game.gameId}/quit`);
    expect(res.body).toEqual({ status: 'abandoned' });
    expect((await api.post(`/api/single/games/${game.gameId}/quit`)).body).toEqual({
      status: 'abandoned',
    });
    expect((await api.post(`/api/single/games/${game.gameId}/rounds/next`)).status).toBe(409);
  });

  test('quitting a finished game leaves it finished', async () => {
    const { gameId } = await playGame({ app, clock, token: maya.token });
    expect((await api.post(`/api/single/games/${gameId}/quit`)).body).toEqual({
      status: 'finished',
    });
  });
});

describe('finishing a game', () => {
  test('the last round reports isLast, saves totals and updates stats', async () => {
    const { gameId, last } = await playGame({ app, clock, token: maya.token, secondsPerRound: 30 });
    // T,C,S,A all valid with 30 s left: 40 + 5 = 45 each; B has three valid: 30
    expect(last.body.isLast).toBe(true);
    expect(last.body.roundScore).toBe(30);
    expect(last.body.totalScore).toBe(45 * 4 + 30);
    const game = await Game.findById(gameId).lean();
    expect(game).toMatchObject({ status: 'finished', totalScore: 210 });
    expect(game.totalTimeMs).toBe(5 * 30_000);
    expect(game.players[0].totalScore).toBe(210);
    const user = await User.findById(maya.user.id ?? maya.user._id).lean();
    expect(user.stats).toMatchObject({
      singleGamesPlayed: 1,
      gamesPlayed: 1,
      bestSingleScore: 210,
    });
    expect(user.stats.bestByRounds['5']).toBe(210);
  });

  test('the summary carries the figures the game over screen shows', async () => {
    const { gameId } = await playGame({ app, clock, token: maya.token, secondsPerRound: 30 });
    const { body } = await api.get(`/api/single/games/${gameId}`);
    expect(body.status).toBe('finished');
    expect(body.summary).toEqual({
      totalScore: 210,
      newPersonalBest: true,
      validAnswers: 19,
      possibleAnswers: 20,
      fastestRoundSeconds: 30,
      rankToday: 1,
    });
  });

  test('personal best is flagged and saved only when beaten', async () => {
    const play = (secondsPerRound) => playGame({ app, clock, token: maya.token, secondsPerRound });
    const first = await play(30);
    const slower = await play(50); // scores less
    const faster = await play(10); // scores more
    const summary = async (id) => (await api.get(`/api/single/games/${id}`)).body.summary;
    expect((await summary(first.gameId)).newPersonalBest).toBe(true);
    expect((await summary(slower.gameId)).newPersonalBest).toBe(false);
    expect((await summary(faster.gameId)).newPersonalBest).toBe(true);
    const user = await User.findById(maya.user.id ?? maya.user._id).lean();
    expect(user.stats.bestByRounds['5']).toBe(faster.last.body.totalScore);
    expect(user.stats.singleGamesPlayed).toBe(3);
  });

  test('best scores are kept per number of rounds', async () => {
    await playGame({ app, clock, token: maya.token, rounds: 5 });
    const ten = await playGame({
      app,
      clock,
      token: maya.token,
      rounds: 10,
      answers: ANSWERS,
    });
    const user = await User.findById(maya.user.id ?? maya.user._id).lean();
    expect(Object.keys(user.stats.bestByRounds).sort()).toEqual(['10', '5']);
    expect(user.stats.bestByRounds['10']).toBe(ten.last.body.totalScore);
  });

  test('an abandoned game does not count', async () => {
    const game = await startGame();
    const round = await nextRound(game.gameId);
    at(round, 5);
    await submit(game.gameId, 0, ANSWERS.T);
    await api.post(`/api/single/games/${game.gameId}/quit`);
    const user = await User.findById(maya.user.id ?? maya.user._id).lean();
    expect(user.stats.singleGamesPlayed).toBe(0);
    const board = await api.get('/api/leaderboards/single?rounds=5');
    expect(board.body.entries).toEqual([]);
  });
});

describe('GET /api/leaderboards/single', () => {
  test('lists one best entry per player, ordered by score then lower time, with the caller marked', async () => {
    const ben = await signUp(app, 'Ben');
    const cy = await signUp(app, 'Cyrus');
    await playGame({ app, clock, token: maya.token, secondsPerRound: 50 });
    await playGame({ app, clock, token: maya.token, secondsPerRound: 10 }); // Maya's better game
    await playGame({ app, clock, token: ben.token, secondsPerRound: 10 }); // same score, same time as Maya
    await playGame({ app, clock, token: cy.token, secondsPerRound: 50 });
    const res = await api.get('/api/leaderboards/single?rounds=5');
    expect(res.status).toBe(200);
    const names = res.body.entries.map((e) => e.nickname);
    expect(names).toEqual(['Maya', 'Ben', 'Cyrus']);
    expect(res.body.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(res.body.entries[0]).toMatchObject({ isYou: true, avatarColor: expect.any(String) });
    expect(res.body.you).toMatchObject({ nickname: 'Maya', rank: 1 });
    expect(res.body.entries[0].totalScore).toBeGreaterThan(res.body.entries[2].totalScore);
  });

  test('equal scores rank the lower total time first', async () => {
    const ben = await signUp(app, 'Ben');
    // 5 s and 7 s both leave 40+ seconds; with the ceil(remaining/6) rule 5 s and 7 s differ in score,
    // so use identical answers and the same score band: 20 s and 22 s both give bonus 7
    await playGame({ app, clock, token: maya.token, secondsPerRound: 22 });
    await playGame({ app, clock, token: ben.token, secondsPerRound: 20 });
    const res = await api.get('/api/leaderboards/single?rounds=5');
    const [first, second] = res.body.entries;
    expect(first.totalScore).toBe(second.totalScore);
    expect([first.nickname, second.nickname]).toEqual(['Ben', 'Maya']);
  });

  test('the caller sees their rank even below the shown limit', async () => {
    const ben = await signUp(app, 'Ben');
    await playGame({ app, clock, token: ben.token, secondsPerRound: 5 });
    await playGame({ app, clock, token: maya.token, secondsPerRound: 50 });
    const res = await api.get('/api/leaderboards/single?rounds=5&limit=1');
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].nickname).toBe('Ben');
    expect(res.body.you).toMatchObject({ nickname: 'Maya', rank: 2 });
  });

  test('daily, weekly and all only include games inside the window', async () => {
    const ben = await signUp(app, 'Ben');
    await playGame({ app, clock, token: ben.token });
    clock.advance(3 * 24 * 60 * 60 * 1000); // three days later
    await playGame({ app, clock, token: maya.token });
    const names = async (period) =>
      (await api.get(`/api/leaderboards/single?rounds=5&period=${period}`)).body.entries
        .map((e) => e.nickname)
        .sort();
    expect(await names('daily')).toEqual(['Maya']);
    expect(await names('weekly')).toEqual(['Ben', 'Maya']);
    clock.advance(10 * 24 * 60 * 60 * 1000);
    expect(await names('weekly')).toEqual([]);
    expect(await names('all')).toEqual(['Ben', 'Maya']);
  });

  test('only games with the chosen number of rounds are listed', async () => {
    await playGame({ app, clock, token: maya.token, rounds: 5 });
    expect((await api.get('/api/leaderboards/single?rounds=10')).body.entries).toEqual([]);
    expect((await api.get('/api/leaderboards/single?rounds=5')).body.entries).toHaveLength(1);
  });

  test('defaults to ten rounds and all time, and has no entry for a player who has not played', async () => {
    const res = await api.get('/api/leaderboards/single');
    expect(res.body).toEqual({ entries: [], you: null });
  });

  test('rejects bad filters and needs sign-in', async () => {
    expect((await api.get('/api/leaderboards/single?period=yearly')).status).toBe(400);
    expect((await api.get('/api/leaderboards/single?rounds=7')).status).toBe(400);
    expect((await api.get('/api/leaderboards/single?limit=500')).status).toBe(400);
    expect((await authed(app, 'x').get('/api/leaderboards/single')).status).toBe(401);
  });
});

describe('a timer shortened for tests', () => {
  test('TEST_ROUND_SECONDS changes the window and the time bonus scale', async () => {
    const short = createSingleApp({
      envSource: { TEST_ROUND_SECONDS: '10', TEST_LETTER_REVEAL_MS: '0' },
    });
    const ana = await signUp(short.app, 'Ana');
    const a = authed(short.app, ana.token);
    const { body: game } = await a.post('/api/single/games').send({ rounds: 5 });
    expect(game.roundSeconds).toBe(10);
    const { body: round } = await a.post(`/api/single/games/${game.gameId}/rounds/next`);
    expect(new Date(round.endsAt).getTime() - new Date(round.startedAt).getTime()).toBe(10_000);
    expect(new Date(round.startedAt).getTime()).toBe(round.serverNow);
    short.clock.t = new Date(round.startedAt).getTime() + 5000;
    const res = await a
      .post(`/api/single/games/${game.gameId}/rounds/0/submit`)
      .send({ answers: ANSWERS.T });
    expect(res.body.timeBonus).toBe(5);
  });
});

test('fake clock helper moves time', () => {
  const c = createFakeClock(0);
  c.advance(5);
  expect(c.now()).toBe(5);
});
