import request from 'supertest';
import { Block } from '../../src/models/Block.js';
import { Challenge } from '../../src/models/Challenge.js';
import { ChatMessage } from '../../src/models/ChatMessage.js';
import { Game } from '../../src/models/Game.js';
import { Report } from '../../src/models/Report.js';
import { Room } from '../../src/models/Room.js';
import { Round } from '../../src/models/Round.js';
import { Session } from '../../src/models/Session.js';
import { Submission } from '../../src/models/Submission.js';
import { User } from '../../src/models/User.js';
import { startRealtimeServer } from '../helpers/realtimeHelpers.js';
import { clearDb, startTestDb, stopTestDb } from '../helpers/testDb.js';

beforeAll(startTestDb, 120_000);
afterAll(stopTestDb);
beforeEach(clearDb);

const times = { startedAt: new Date(), endsAt: new Date() };
const answer = (raw) => ({ raw, normalized: raw, matchKey: raw, verdict: 'valid', points: 10 });
const answers = (raw) => ({
  name: answer(raw),
  place: answer(raw),
  animal: answer(raw),
  thing: answer(raw),
});

let rt;
beforeEach(async () => {
  rt = await startRealtimeServer({});
});
afterEach(async () => {
  await rt.close();
});

const del = (token, password = 'Test1234') =>
  request(rt.app)
    .delete('/api/users/me')
    .set('Authorization', `Bearer ${token}`)
    .send({ password });

describe('DELETE /api/users/me', () => {
  test('needs a login and the right password', async () => {
    const maya = await rt.player('Maya');
    expect((await request(rt.app).delete('/api/users/me').send({ password: 'x' })).status).toBe(
      401,
    );
    const wrong = await del(maya.token, 'Wrong1234');
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details[0].field).toBe('password');
    expect((await del(maya.token, '')).status).toBe(400);
    expect(await User.countDocuments({ nicknameLower: 'maya' })).toBe(1);
  });

  test('removes the account, signs it out everywhere and frees the nickname', async () => {
    const maya = await rt.player('Maya');
    await Session.create({
      userId: maya.user.id,
      jti: 'j1',
      expiresAt: new Date(Date.now() + 1e6),
    });
    const res = await del(maya.token);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.join(';')).toMatch(/ff_refresh=;/);
    expect(await User.countDocuments({})).toBe(0);
    expect(await Session.countDocuments({})).toBe(0);
    expect(
      (await request(rt.app).get('/api/auth/me').set('Authorization', `Bearer ${maya.token}`))
        .status,
    ).toBe(401);
    const login = await request(rt.app)
      .post('/api/auth/login')
      .send({ identifier: 'maya@example.com', password: 'Test1234' });
    expect(login.status).toBe(401);
    const again = await request(rt.app).post('/api/auth/signup').send({
      nickname: 'Maya',
      email: 'maya@example.com',
      password: 'Test1234',
      ageConfirmed: true,
      termsAccepted: true,
    });
    expect(again.status).toBe(201);
  });

  test('an admin account cannot be deleted this way', async () => {
    const boss = await rt.player('Boss');
    await User.updateOne({ _id: boss.user.id }, { role: 'admin' });
    const res = await del(boss.token);
    expect(res.status).toBe(403);
    expect(await User.countDocuments({})).toBe(1);
  });

  test('personal data goes, group results stay under "Deleted player"', async () => {
    const maya = await rt.player('Maya');
    const ben = await rt.player('Ben');
    const [m, b] = [maya.user.id, ben.user.id];

    const solo = await Game.create({
      mode: 'single',
      players: [{ userId: m, nickname: 'Maya', totalScore: 40 }],
      settings: { rounds: 5 },
      status: 'finished',
      totalScore: 40,
    });
    const soloRound = await Round.create({ gameId: solo._id, index: 0, letter: 'T', ...times });
    await Submission.create({
      roundId: soloRound._id,
      gameId: solo._id,
      userId: m,
      answers: answers('tiger'),
    });

    const group = await Game.create({
      mode: 'group',
      players: [
        { userId: m, nickname: 'Maya', totalScore: 50, uniqueAnswers: 3 },
        { userId: b, nickname: 'Ben', totalScore: 30 },
      ],
      settings: { rounds: 5 },
      status: 'finished',
      winnerIds: [m],
    });
    const round = await Round.create({
      gameId: group._id,
      index: 0,
      letter: 'T',
      bonusWinnerId: m,
      ...times,
    });
    await Submission.create({
      roundId: round._id,
      gameId: group._id,
      userId: m,
      answers: answers('tiger'),
      roundScore: 40,
    });
    await Submission.create({
      roundId: round._id,
      gameId: group._id,
      userId: b,
      answers: answers('table'),
      roundScore: 30,
    });
    await Challenge.create({
      gameId: group._id,
      roundId: round._id,
      targetUserId: m,
      initiatorId: b,
      category: 'animal',
      word: 'tiger',
      type: 'challenge',
      outcome: 'upheld',
      countsAsFailed: true,
      resolvedAt: new Date(),
    });
    await Challenge.create({
      gameId: group._id,
      roundId: round._id,
      targetUserId: b,
      initiatorId: m,
      category: 'thing',
      word: 'table',
      type: 'challenge',
      outcome: 'upheld',
      countsAsFailed: true,
      resolvedAt: new Date(),
    });
    await ChatMessage.create({ userId: m, nickname: 'Maya', roomCode: 'ABCDEF', text: 'hi' });
    await ChatMessage.create({ userId: b, nickname: 'Ben', roomCode: 'ABCDEF', text: 'yo' });
    await Block.create({ userId: m, blockedUserId: b });
    await Block.create({ userId: b, blockedUserId: m });
    await Report.create({ reporterId: m, targetUserId: b, context: 'chat', reason: 'spam' });
    await Report.create({ reporterId: b, targetUserId: m, context: 'chat', reason: 'spam' });
    await Room.create({
      code: 'ABCDEF',
      hostId: m,
      players: [
        { userId: m, nickname: 'Maya' },
        { userId: b, nickname: 'Ben' },
      ],
      expiresAt: new Date(Date.now() + 1e6),
    });

    expect((await del(maya.token)).status).toBe(204);

    // Gone completely.
    expect(await Game.countDocuments({ mode: 'single' })).toBe(0);
    expect(await Submission.countDocuments({ gameId: solo._id })).toBe(0);
    expect(await Round.countDocuments({ gameId: solo._id })).toBe(0);
    expect(await ChatMessage.find({}).lean()).toHaveLength(1);
    expect(await Block.countDocuments({})).toBe(0);
    expect(await Report.countDocuments({})).toBe(0);

    // Kept for the others, without the person.
    const kept = await Game.findById(group._id).lean();
    expect(kept.players.map((p) => p.nickname)).toEqual(['Deleted player', 'Ben']);
    expect(kept.players[0]).toMatchObject({ totalScore: 50, uniqueAnswers: 3 });
    expect(String(kept.players[0].userId)).not.toBe(m);
    expect(String(kept.winnerIds[0])).toBe(String(kept.players[0].userId));
    expect(String(kept.players[1].userId)).toBe(b);

    const subs = await Submission.find({ gameId: group._id }).lean();
    const gone = subs.find((s) => String(s.userId) === String(kept.players[0].userId));
    expect(gone.roundScore).toBe(40);
    expect(gone.answers.name).toMatchObject({ raw: '', normalized: '', matchKey: '', points: 10 });
    const bens = subs.find((s) => String(s.userId) === b);
    expect(bens.answers.name.raw).toBe('table');

    const challenges = await Challenge.find({}).lean();
    expect(
      challenges.some((c) => String(c.targetUserId) === m || String(c.initiatorId) === m),
    ).toBe(false);
    expect(challenges.find((c) => c.category === 'animal').word).toBe('');
    expect(challenges.find((c) => c.category === 'thing').word).toBe('table');

    const room = await Room.findOne({ code: 'ABCDEF' }).lean();
    expect(room.players.map((p) => p.nickname)).toEqual(['Deleted player', 'Ben']);
    expect(String(room.hostId)).not.toBe(m);
    expect(String((await Round.findById(round._id).lean()).bonusWinnerId)).not.toBe(m);
    expect(await User.findById(b)).not.toBeNull();
  });

  test('two deleted players in one game do not clash', async () => {
    const maya = await rt.player('Maya');
    const ben = await rt.player('Ben');
    const game = await Game.create({
      mode: 'group',
      players: [
        { userId: maya.user.id, nickname: 'Maya' },
        { userId: ben.user.id, nickname: 'Ben' },
      ],
      settings: { rounds: 5 },
      status: 'finished',
    });
    const round = await Round.create({ gameId: game._id, index: 0, letter: 'T', ...times });
    for (const p of [maya, ben]) {
      await Submission.create({
        roundId: round._id,
        gameId: game._id,
        userId: p.user.id,
        answers: answers('tiger'),
      });
    }
    expect((await del(maya.token)).status).toBe(204);
    expect((await del(ben.token)).status).toBe(204);
    expect(await Submission.countDocuments({ gameId: game._id })).toBe(2);
    const kept = await Game.findById(game._id).lean();
    expect(new Set(kept.players.map((p) => String(p.userId))).size).toBe(2);
  });

  test('a player in a live room is removed from it and disconnected', async () => {
    const maya = await rt.player('Maya');
    const ben = await rt.player('Ben');
    const { data } = await maya.emitAck('room:create', { settings: { maxPlayers: 4, rounds: 5 } });
    await ben.emitAck('room:join', { code: data.code });
    const closed = new Promise((resolve) => maya.socket.once('disconnect', resolve));
    const res = await del(maya.token);
    expect(res.status).toBe(204);
    await closed;
    expect(maya.log.find((e) => e.event === 'error:notice')?.payload.code).toBe('ACCOUNT_DELETED');
    const state = await ben.waitFor('room:state', (s) => s.players.length === 1);
    expect(state.players[0].nickname).toBe('Ben');
    expect(rt.roomManager.preview(data.code).players ?? []).not.toContain('Maya');
  });

  test('a locked-out socket token cannot reconnect', async () => {
    const maya = await rt.player('Maya');
    await del(maya.token);
    await expect(rt.connect(maya.token).ready()).rejects.toThrow();
  });
});
