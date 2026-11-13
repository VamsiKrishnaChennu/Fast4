import request from 'supertest';
import { ChatMessage } from '../../src/models/ChatMessage.js';
import { Report } from '../../src/models/Report.js';
import { User } from '../../src/models/User.js';
import { startRealtimeServer, tick } from '../helpers/realtimeHelpers.js';
import { clearDb, startTestDb, stopTestDb } from '../helpers/testDb.js';

beforeAll(startTestDb, 120_000);
afterAll(stopTestDb);
beforeEach(clearDb);

describe('chat over real sockets', () => {
  let rt;
  beforeEach(async () => {
    rt = await startRealtimeServer({});
  });
  afterEach(() => rt.close());

  async function lobby(...names) {
    const [host, ...others] = await Promise.all(names.map((n) => rt.player(n)));
    const code = (await host.emitAck('room:create', { settings: { maxPlayers: 8, rounds: 5 } }))
      .data.code;
    for (const o of others) await o.emitAck('room:join', { code });
    return { host, others, code };
  }

  test('a message reaches everyone in the room and is cleaned', async () => {
    const { host, others } = await lobby('Maya', 'Ben');
    const ack = await host.emitAck('chat:send', { text: '  hello    <b>there</b>  ' });
    expect(ack.ok).toBe(true);
    const got = await others[0].waitFor('chat:message');
    expect(got.message).toMatchObject({
      userId: host.user.id,
      nickname: 'Maya',
      text: 'hello <b>there</b>',
    });
    expect(await ChatMessage.countDocuments({})).toBe(1);
  });

  test('empty, long and masked text', async () => {
    const { host, others } = await lobby('Maya', 'Ben');
    expect((await host.emitAck('chat:send', { text: '   ' })).error.code).toBe('VALIDATION_ERROR');
    expect((await host.emitAck('chat:send', { text: 'a'.repeat(201) })).error.code).toBe(
      'VALIDATION_ERROR',
    );
    await host.emitAck('chat:send', { text: 'you are a shit player' });
    const got = await others[0].waitFor('chat:message');
    expect(got.message.text).not.toMatch(/shit/i);
    expect(got.message.text).toMatch(/\*{4}/);
  });

  test('more than 5 messages in 10 seconds is rate limited', async () => {
    const { host } = await lobby('Maya', 'Ben');
    for (let i = 0; i < 5; i += 1) {
      expect((await host.emitAck('chat:send', { text: `m${i}` })).ok).toBe(true);
    }
    expect((await host.emitAck('chat:send', { text: 'six' })).error.code).toBe('RATE_LIMITED');
    rt.clock.advance(10_001);
    expect((await host.emitAck('chat:send', { text: 'again' })).ok).toBe(true);
  });

  test('chat is closed while writing and open again in review', async () => {
    const { host, others } = await lobby('Maya', 'Ben');
    await host.emitAck('game:start', {});
    rt.clock.advance(7000);
    await tick();
    expect(host.lastState().phase).toBe('WRITING');
    expect((await host.emitAck('chat:send', { text: 'hi' })).error.code).toBe('INVALID_PHASE');
    for (const p of [host, others[0]]) {
      await p.emitAck('answer:submit', {
        roundIndex: 0,
        answers: { name: 'Tara', place: 'Tokyo', animal: 'Tiger', thing: 'Table' },
      });
    }
    await host.waitFor('round:review');
    expect((await host.emitAck('chat:send', { text: 'gg' })).ok).toBe(true);
  });

  test('a muted player gets MUTED until the mute ends', async () => {
    const { host } = await lobby('Maya', 'Ben');
    await User.updateOne({ _id: host.user.id }, { mutedUntil: new Date(rt.clock.now() + 60_000) });
    expect((await host.emitAck('chat:send', { text: 'hi' })).error.code).toBe('MUTED');
    rt.clock.advance(61_000);
    expect((await host.emitAck('chat:send', { text: 'hi' })).ok).toBe(true);
  });

  test('chat needs a room', async () => {
    const solo = await rt.player('Maya');
    expect((await solo.emitAck('chat:send', { text: 'hi' })).error.code).toBe('ROOM_NOT_FOUND');
  });

  test('history of the last 50 is sent on join', async () => {
    // Three senders take turns, so no single socket hits its event limit (30 per 10 seconds).
    const { host, others, code } = await lobby('Maya', 'Ben', 'Cyrus');
    const senders = [host, ...others];
    for (let i = 0; i < 60; i += 1) {
      rt.clock.advance(11_000);
      await senders[i % 3].emitAck('chat:send', { text: `msg ${i}` });
    }
    const late = await rt.player('Dara');
    await late.emitAck('room:join', { code });
    const history = await late.waitFor('chat:history');
    expect(history.messages).toHaveLength(50);
    expect(history.messages.at(-1).text).toBe('msg 59');
    expect(history.messages[0].text).toBe('msg 10');
  });

  test('blocked senders are hidden live and in history, and unblocking restores new ones', async () => {
    const { host, others, code } = await lobby('Maya', 'Ben');
    const ben = others[0];
    const auth = { Authorization: `Bearer ${ben.token}` };
    await host.emitAck('chat:send', { text: 'before block' });
    const res = await request(rt.app).post('/api/blocks').set(auth).send({ userId: host.user.id });
    expect(res.status).toBe(201);
    await host.emitAck('chat:send', { text: 'after block' });
    await tick();
    const texts = ben.log
      .filter((e) => e.event === 'chat:message')
      .map((e) => e.payload.message.text);
    expect(texts).toEqual(['before block']);

    // History for the blocker leaves the blocked sender out, even after rejoining.
    ben.log.length = 0;
    await ben.emitAck('room:join', { code });
    const history = await ben.waitFor('chat:history');
    expect(history.messages).toEqual([]);

    // Nobody is removed and scores are untouched.
    expect(ben.lastState().players).toHaveLength(2);

    await request(rt.app).delete(`/api/blocks/${host.user.id}`).set(auth).expect(204);
    rt.clock.advance(11_000);
    await host.emitAck('chat:send', { text: 'after unblock' });
    const got = await ben.waitFor('chat:message', (p) => p.message.text === 'after unblock');
    expect(got.message.nickname).toBe('Maya');
  });
});

describe('blocks, reports, history, leaderboard and profile over REST', () => {
  let rt;
  beforeEach(async () => {
    rt = await startRealtimeServer({});
  });
  afterEach(() => rt.close());
  const as = (p) => ({ Authorization: `Bearer ${p.token}` });

  test('blocks list, add (idempotent), remove and validation', async () => {
    const a = await rt.player('Maya');
    const b = await rt.player('Ben');
    expect((await request(rt.app).get('/api/blocks')).status).toBe(401);
    await request(rt.app).post('/api/blocks').set(as(a)).send({ userId: b.user.id }).expect(201);
    const again = await request(rt.app)
      .post('/api/blocks')
      .set(as(a))
      .send({ userId: b.user.id })
      .expect(201);
    expect(again.body.blocks).toHaveLength(1);
    const list = await request(rt.app).get('/api/blocks').set(as(a)).expect(200);
    expect(list.body.blocks[0]).toMatchObject({ userId: b.user.id, nickname: 'Ben' });
    await request(rt.app).post('/api/blocks').set(as(a)).send({ userId: a.user.id }).expect(400);
    await request(rt.app)
      .post('/api/blocks')
      .set(as(a))
      .send({ userId: '64b000000000000000000000' })
      .expect(404);
    await request(rt.app).delete(`/api/blocks/${b.user.id}`).set(as(a)).expect(204);
    expect((await request(rt.app).get('/api/blocks').set(as(a))).body.blocks).toEqual([]);
  });

  test('a chat report copies the message text and the admin can act on it', async () => {
    const a = await rt.player('Maya');
    const b = await rt.player('Ben');
    const code = (await a.emitAck('room:create', { settings: { maxPlayers: 8, rounds: 5 } })).data
      .code;
    await b.emitAck('room:join', { code });
    const sent = await a.emitAck('chat:send', { text: 'rude words' });
    const messageId = sent.data.message.id;
    const res = await request(rt.app)
      .post('/api/reports')
      .set(as(b))
      .send({ targetUserId: a.user.id, context: 'chat', refId: messageId, reason: 'harassment' })
      .expect(201);
    await ChatMessage.deleteMany({}); // the report keeps its own copy
    const saved = await Report.findById(res.body.id).lean();
    expect(saved.snapshot).toBe('rude words');

    const admin = await rt.player('Boss1');
    await User.updateOne({ _id: admin.user.id }, { role: 'admin' });
    await request(rt.app).get('/api/admin/reports').set(as(b)).expect(403);
    const queue = await request(rt.app)
      .get('/api/admin/reports?status=open')
      .set(as(admin))
      .expect(200);
    expect(queue.body.reports[0]).toMatchObject({
      snapshot: 'rude words',
      reason: 'harassment',
      target: { nickname: 'Maya' },
    });

    await request(rt.app)
      .post(`/api/admin/reports/${res.body.id}/action`)
      .set(as(admin))
      .send({ action: 'mute', hours: 2 })
      .expect(200);
    const muted = await User.findById(a.user.id).lean();
    expect(new Date(muted.mutedUntil).getTime()).toBeGreaterThan(rt.clock.now());
    await request(rt.app)
      .post(`/api/admin/reports/${res.body.id}/action`)
      .set(as(admin))
      .send({ action: 'dismiss' })
      .expect(409);
  });

  test('a ban suspends the account, disconnects it and blocks login', async () => {
    const a = await rt.player('Maya');
    const b = await rt.player('Ben');
    const report = await request(rt.app)
      .post('/api/reports')
      .set(as(b))
      .send({ targetUserId: a.user.id, context: 'nickname', reason: 'hate' })
      .expect(201);
    expect((await Report.findById(report.body.id).lean()).snapshot).toBe('Maya');
    const admin = await rt.player('Boss1');
    await User.updateOne({ _id: admin.user.id }, { role: 'admin' });
    const closed = new Promise((resolve) => a.socket.once('disconnect', resolve));
    await request(rt.app)
      .post(`/api/admin/reports/${report.body.id}/action`)
      .set(as(admin))
      .send({ action: 'ban' })
      .expect(200);
    await closed;
    const banned = await User.findById(a.user.id).select('+tokenVersion').lean();
    expect(banned.bannedAt).toBeTruthy();
    expect(banned.tokenVersion).toBeGreaterThan(0);
    await request(rt.app).get('/api/auth/me').set(as(a)).expect(401);
  });

  test('reports are limited to 10 a day and cannot target yourself', async () => {
    const a = await rt.player('Maya');
    const b = await rt.player('Ben');
    await request(rt.app)
      .post('/api/reports')
      .set(as(a))
      .send({ targetUserId: a.user.id, context: 'nickname', reason: 'other' })
      .expect(400);
    for (let i = 0; i < 10; i += 1) {
      await request(rt.app)
        .post('/api/reports')
        .set(as(a))
        .send({ targetUserId: b.user.id, context: 'nickname', reason: 'other' })
        .expect(201);
    }
    const eleventh = await request(rt.app)
      .post('/api/reports')
      .set(as(a))
      .send({ targetUserId: b.user.id, context: 'nickname', reason: 'other' });
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error.code).toBe('RATE_LIMITED');
  });

  test('profile update: nickname rules, uniqueness and avatar', async () => {
    const a = await rt.player('Maya');
    await rt.player('Ben');
    const ok = await request(rt.app)
      .patch('/api/users/me')
      .set(as(a))
      .send({ nickname: 'Mayaa', avatarColor: '#1FA463' });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ nickname: 'Mayaa' });
    expect(
      (await request(rt.app).patch('/api/users/me').set(as(a)).send({ nickname: 'BEN' })).status,
    ).toBe(409);
    expect(
      (await request(rt.app).patch('/api/users/me').set(as(a)).send({ nickname: 'Admin' })).status,
    ).toBe(400);
    expect(
      (await request(rt.app).patch('/api/users/me').set(as(a)).send({ avatarColor: '#123456' }))
        .status,
    ).toBe(400);
    expect((await request(rt.app).patch('/api/users/me').set(as(a)).send({})).status).toBe(400);
  });

  test('history is paginated newest first and the group leaderboard ranks correctly', async () => {
    const [a, b, c] = await Promise.all(['Maya', 'Ben', 'Cara'].map((n) => rt.player(n)));
    const { Game } = await import('../../src/models/Game.js');
    const mk = (i, players, mode = 'group') =>
      Game.create({
        mode,
        status: 'finished',
        settings: { rounds: 5 },
        endedAt: new Date(Date.UTC(2026, 10, 1, 12, i)),
        players: players.map(([u, score, rank]) => ({
          userId: u.user.id,
          nickname: u.user.nickname,
          totalScore: score,
          rank,
        })),
      });
    for (let i = 0; i < 25; i += 1)
      await mk(i, [
        [a, 10 + i, 1],
        [b, 5, 2],
      ]);
    const first = await request(rt.app).get('/api/users/me/games?limit=20').set(as(a)).expect(200);
    expect(first.body.games).toHaveLength(20);
    expect(first.body.games[0].score).toBe(34);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await request(rt.app)
      .get(`/api/users/me/games?limit=20&cursor=${first.body.nextCursor}`)
      .set(as(a))
      .expect(200);
    expect(second.body.games).toHaveLength(5);
    expect(second.body.nextCursor).toBeNull();
    expect((await request(rt.app).get('/api/users/me/games').set(as(c))).body.games).toEqual([]);

    await User.updateOne(
      { _id: a.user.id },
      { 'stats.groupGamesPlayed': 4, 'stats.groupWins': 3, 'stats.groupTotalScore': 100 },
    );
    await User.updateOne(
      { _id: b.user.id },
      { 'stats.groupGamesPlayed': 4, 'stats.groupWins': 3, 'stats.groupTotalScore': 100 },
    );
    await User.updateOne(
      { _id: c.user.id },
      { 'stats.groupGamesPlayed': 2, 'stats.groupWins': 1, 'stats.groupTotalScore': 150 },
    );
    const wins = await request(rt.app)
      .get('/api/leaderboards/group?metric=wins')
      .set(as(c))
      .expect(200);
    expect(wins.body.entries.map((e) => [e.nickname, e.rank])).toEqual([
      ['Maya', 1],
      ['Ben', 1],
      ['Cara', 3],
    ]);
    expect(wins.body.you).toMatchObject({ nickname: 'Cara', rank: 3, isYou: true });
    const points = await request(rt.app)
      .get('/api/leaderboards/group?metric=points&limit=1')
      .set(as(a))
      .expect(200);
    expect(points.body.entries).toHaveLength(1);
    expect(points.body.entries[0]).toMatchObject({ nickname: 'Cara', rank: 1, points: 150 });
    expect(points.body.you).toMatchObject({ nickname: 'Maya', rank: 2 });
    await request(rt.app).get('/api/leaderboards/group?metric=bogus').set(as(a)).expect(400);
  });
});
