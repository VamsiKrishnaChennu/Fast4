import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Room } from '../../src/models/Room.js';
import { User } from '../../src/models/User.js';
import { clearDb, startTestDb, stopTestDb } from '../helpers/testDb.js';
import { startRealtimeServer, tick } from '../helpers/realtimeHelpers.js';

let rt;

beforeAll(startTestDb, 120_000);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearDb();
  rt = await startRealtimeServer();
});
afterEach(async () => {
  await rt.close();
});

const settings = (maxPlayers = 8, rounds = 10) => ({ settings: { maxPlayers, rounds } });

describe('connecting', () => {
  test('a connection without a token or with a bad token is refused', async () => {
    await expect(rt.connect(undefined, { auth: {} }).ready()).rejects.toThrow(/log in/i);
    await expect(rt.connect('garbage').ready()).rejects.toThrow();
    const refused = rt.connect('garbage');
    const err = await refused.ready().catch((e) => e);
    expect(err.data).toEqual({ code: 'UNAUTHENTICATED' });
  });

  test('an expired token says so, so the app can refresh and retry', async () => {
    const maya = await rt.player('Maya');
    const user = await User.findById(maya.user.id ?? maya.user._id);
    const expired = jwt.sign(
      { sub: String(user._id), role: user.role, tv: 0 },
      rt.env.JWT_ACCESS_SECRET,
      {
        expiresIn: -10,
      },
    );
    const err = await rt
      .connect(expired)
      .ready()
      .catch((e) => e);
    expect(err.data).toEqual({ code: 'TOKEN_EXPIRED' });
  });

  test('a banned account cannot connect', async () => {
    const maya = await rt.player('Maya');
    await User.updateOne({ nickname: 'Maya' }, { $set: { bannedAt: new Date() } });
    const err = await rt
      .connect(maya.token)
      .ready()
      .catch((e) => e);
    expect(err.data).toEqual({ code: 'ACCOUNT_SUSPENDED' });
  });

  test('a token from before a password change stops working', async () => {
    const maya = await rt.player('Maya');
    await User.updateOne({ nickname: 'Maya' }, { $inc: { tokenVersion: 1 } });
    const err = await rt
      .connect(maya.token)
      .ready()
      .catch((e) => e);
    expect(err.data).toEqual({ code: 'UNAUTHENTICATED' });
  });

  test('time:sync answers with the server time', async () => {
    const maya = await rt.player('Maya');
    const res = await maya.emitAck('time:sync');
    expect(res.ok).toBe(true);
    expect(Math.abs(res.data.serverNow - Date.now())).toBeLessThan(2000);
  });
});

describe('room:create', () => {
  test('with the default settings returns a 6 character code and makes the caller host', async () => {
    const maya = await rt.player('Maya');
    const res = await maya.emitAck('room:create', {});
    expect(res.ok).toBe(true);
    expect(res.data.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(res.data.room).toMatchObject({
      settings: { maxPlayers: 8, rounds: 10 },
      phase: 'LOBBY',
      hostId: String(maya.user.id ?? maya.user._id),
    });
    expect(res.data.room.players).toHaveLength(1);
  });

  test('works when the client sends only an acknowledgement', async () => {
    const maya = await rt.player('Maya');
    const res = await new Promise((resolve) => maya.socket.emit('room:create', resolve));
    expect(res.ok).toBe(true);
  });

  test.each([
    ['rounds 3', settings(8, 3)],
    ['rounds 21', settings(8, 21)],
    ['maxPlayers 9', settings(9, 10)],
    ['maxPlayers 1', settings(1, 10)],
    ['text instead of a number', { settings: { maxPlayers: '8', rounds: 10 } }],
    ['unknown setting', { settings: { maxPlayers: 8, rounds: 10, lengthSeconds: 5 } }],
    ['unknown key', { settings: { maxPlayers: 8, rounds: 10 }, extra: true }],
  ])('invalid settings (%s) give VALIDATION_ERROR', async (_label, payload) => {
    const maya = await rt.player('Maya');
    const res = await maya.emitAck('room:create', payload);
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('VALIDATION_ERROR');
  });

  test.each([[], 'text', 5])(
    'a malformed payload (%p) never crashes the server',
    async (payload) => {
      const maya = await rt.player('Maya');
      const res = await maya.emitAck('room:create', payload);
      expect(res.ok).toBe(false);
      expect(res.error.code).toBe('VALIDATION_ERROR');
      expect((await maya.emitAck('time:sync')).ok).toBe(true);
    },
  );

  test('the room is also saved in the database', async () => {
    await rt.close();
    rt = await startRealtimeServer({ persist: true });
    const maya = await rt.player('Maya');
    const { data } = await maya.emitAck('room:create', settings(4, 6));
    await tick(100);
    const saved = await Room.findOne({ code: data.code }).lean();
    expect(saved).toMatchObject({ status: 'lobby', settings: { maxPlayers: 4, rounds: 6 } });
    expect(saved.players).toHaveLength(1);
    expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now() + 5 * 3600_000);
    await maya.emitAck('room:leave', {});
    await tick(100);
    expect((await Room.findOne({ code: data.code }).lean()).status).toBe('abandoned');
  });
});

describe('room persistence', () => {
  test('rooms past their six hours are deleted, recent ones kept, open ones abandoned at start-up', async () => {
    const { createRoomPersistence } = await import('../../src/services/roomPersistence.js');
    const { createLogger } = await import('../../src/config/logger.js');
    const logger = createLogger(rt.env);
    const clock = { now: () => Date.now() };
    const persistence = createRoomPersistence({ logger, clock });
    const base = {
      hostId: '507f1f77bcf86cd799439011',
      settings: { maxPlayers: 8, rounds: 10 },
      players: [],
    };
    await persistence.save({ ...base, code: 'AAAAAA', status: 'lobby' });
    await persistence.save({ ...base, code: 'BBBBBB', status: 'in_progress' });
    await Room.updateOne({ code: 'AAAAAA' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await persistence.purgeExpired()).toBe(1);
    expect(await Room.countDocuments({ code: 'AAAAAA' })).toBe(0);
    expect(await Room.countDocuments({ code: 'BBBBBB' })).toBe(1);
    expect(await persistence.abandonOpenRooms()).toBe(1);
    expect((await Room.findOne({ code: 'BBBBBB' }).lean()).status).toBe('abandoned');
  });
});

describe('room:join', () => {
  async function lobby(extra = {}) {
    const host = await rt.player('Maya');
    const { data } = await host.emitAck('room:create', extra.settings ?? {});
    return { host, code: data.code };
  }

  test('a valid code joins; everyone gets room:playerJoined and room:state', async () => {
    const { host, code } = await lobby();
    const ben = await rt.player('Ben');
    const res = await ben.emitAck('room:join', { code });
    expect(res.ok).toBe(true);
    expect(res.data.room.players.map((p) => p.nickname)).toEqual(['Maya', 'Ben']);
    const joined = await host.waitFor('room:playerJoined');
    expect(joined.player.nickname).toBe('Ben');
    await ben.waitFor('room:state', (s) => s.players.length === 2);
    await host.waitFor('room:state', (s) => s.players.length === 2);
  });

  test('the code can be typed in lower case', async () => {
    const { code } = await lobby();
    const ben = await rt.player('Ben');
    expect((await ben.emitAck('room:join', { code: code.toLowerCase() })).ok).toBe(true);
  });

  test('an unknown or badly formed code is ROOM_NOT_FOUND', async () => {
    const ben = await rt.player('Ben');
    for (const code of ['ZZZZZZ', 'abc', '']) {
      const res = await ben.emitAck('room:join', { code });
      expect(res.error.code).toBe('ROOM_NOT_FOUND');
    }
    expect((await ben.emitAck('room:join', {})).error.code).toBe('VALIDATION_ERROR');
  });

  test('a full room is ROOM_FULL', async () => {
    const { code } = await lobby({ settings: settings(2, 5) });
    const ben = await rt.player('Ben');
    const cy = await rt.player('Cyrus');
    expect((await ben.emitAck('room:join', { code })).ok).toBe(true);
    expect((await cy.emitAck('room:join', { code })).error.code).toBe('ROOM_FULL');
  });

  test('two players racing for the last seat: exactly one gets it', async () => {
    const { code } = await lobby({ settings: settings(2, 5) });
    const ben = await rt.player('Ben');
    const cy = await rt.player('Cyrus');
    const [a, b] = await Promise.all([
      ben.emitAck('room:join', { code }),
      cy.emitAck('room:join', { code }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(rt.roomManager.preview(code).playerCount).toBe(2);
  });

  test('after the game started the room is ROOM_LOCKED', async () => {
    const { host, code } = await lobby();
    const ben = await rt.player('Ben');
    await ben.emitAck('room:join', { code });
    expect((await host.emitAck('game:start', {})).ok).toBe(true);
    const cy = await rt.player('Cyrus');
    expect((await cy.emitAck('room:join', { code })).error.code).toBe('ROOM_LOCKED');
  });

  test('opening a second tab takes over; the first tab is told and the roster has one entry', async () => {
    const { host, code } = await lobby();
    const second = await rt.connect(host.token).ready();
    // the new connection is already rebound to the room by the server
    await second.waitFor('room:state', (s) => s.code === code);
    await host.waitFor('room:kicked', (p) => p.reason === 'takeover');
    expect(second.lastState().players).toHaveLength(1);
    expect(rt.roomManager.preview(code).playerCount).toBe(1);
    // events now reach the new tab only
    const ben = await rt.player('Ben');
    await ben.emitAck('room:join', { code });
    await second.waitFor('room:playerJoined');
    expect(host.count('room:playerJoined')).toBe(0);
  });

  test('a player who reconnects within the grace period gets the room back', async () => {
    const { host, code } = await lobby();
    const ben = await rt.player('Ben');
    await ben.emitAck('room:join', { code });
    ben.socket.close();
    await host.waitFor('room:playerDisconnected');
    expect(host.lastState().players.find((p) => p.nickname === 'Ben').connected).toBe(false);
    const again = await rt.connect(ben.token).ready();
    await again.waitFor('room:state', (s) => s.players.length === 2);
    await host.waitFor('room:playerReconnected');
    expect(rt.roomManager.preview(code).playerCount).toBe(2);
  });
});

describe('host-only actions', () => {
  async function pair() {
    const host = await rt.player('Maya');
    const { data } = await host.emitAck('room:create', {});
    const ben = await rt.player('Ben');
    await ben.emitAck('room:join', { code: data.code });
    return { host, ben, code: data.code };
  }

  test('a player who is not the host gets NOT_HOST for settings, kick and start', async () => {
    const { host, ben } = await pair();
    const hostId = String(host.user.id ?? host.user._id);
    expect((await ben.emitAck('room:updateSettings', settings(4, 5))).error.code).toBe('NOT_HOST');
    expect((await ben.emitAck('room:kick', { userId: hostId })).error.code).toBe('NOT_HOST');
    expect((await ben.emitAck('game:start', {})).error.code).toBe('NOT_HOST');
  });

  test('the host changes settings and everyone sees them', async () => {
    const { host, ben } = await pair();
    const res = await host.emitAck('room:updateSettings', settings(4, 15));
    expect(res.ok).toBe(true);
    const update = await ben.waitFor('room:settingsUpdated');
    expect(update.settings).toEqual({ maxPlayers: 4, rounds: 15 });
    await ben.waitFor('room:state', (s) => s.settings.rounds === 15);
  });

  test('maxPlayers below the current count is rejected', async () => {
    const { host, code } = await pair();
    const cy = await rt.player('Cyrus');
    await cy.emitAck('room:join', { code });
    const res = await host.emitAck('room:updateSettings', settings(2, 10));
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('VALIDATION_ERROR');
    expect(res.error.details[0].field).toBe('maxPlayers');
  });

  test('kicking removes the player, who is told and cannot rejoin', async () => {
    const { host, ben, code } = await pair();
    const benId = String(ben.user.id ?? ben.user._id);
    expect((await host.emitAck('room:kick', { userId: benId })).ok).toBe(true);
    await ben.waitFor('room:kicked', (p) => p.reason === 'removed');
    await host.waitFor('room:playerLeft', (p) => p.player.nickname === 'Ben');
    expect((await ben.emitAck('room:join', { code })).error.code).toBe('FORBIDDEN');
    expect((await host.emitAck('room:kick', { userId: 'x' })).error.code).toBe('VALIDATION_ERROR');
  });

  test('starting needs at least two players', async () => {
    const host = await rt.player('Maya');
    await host.emitAck('room:create', {});
    const res = await host.emitAck('game:start', {});
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/at least 2/);
  });

  test('starting locks the room, announces the game and sends no letter', async () => {
    const { host, ben } = await pair();
    await host.emitAck('room:updateSettings', settings(8, 7));
    expect((await host.emitAck('game:start', {})).ok).toBe(true);
    expect(await ben.waitFor('game:started')).toEqual({ totalRounds: 7 });
    expect(JSON.stringify(ben.log)).not.toMatch(/letter/i);
    expect(ben.lastState()).toMatchObject({ status: 'in_progress', phase: 'STARTING' });
  });
});

describe('leaving and disconnects', () => {
  test('the host leaves: the longest connected player becomes host', async () => {
    const host = await rt.player('Maya');
    const { data } = await host.emitAck('room:create', {});
    const ben = await rt.player('Ben');
    await ben.emitAck('room:join', { code: data.code });
    await tick(20);
    const cy = await rt.player('Cyrus');
    await cy.emitAck('room:join', { code: data.code });
    await host.emitAck('room:leave', {});
    const changed = await cy.waitFor('room:hostChanged');
    expect(changed.hostId).toBe(String(ben.user.id ?? ben.user._id));
    await cy.waitFor('room:playerLeft', (p) => p.player.nickname === 'Maya');
  });

  test('a host who stays disconnected past the grace period loses the role', async () => {
    const host = await rt.player('Maya');
    const { data } = await host.emitAck('room:create', {});
    const ben = await rt.player('Ben');
    await ben.emitAck('room:join', { code: data.code });
    host.socket.close();
    await ben.waitFor('room:playerDisconnected');
    rt.clock.advance(60_000);
    const changed = await ben.waitFor('room:hostChanged');
    expect(changed.hostId).toBe(String(ben.user.id ?? ben.user._id));
  });

  test('when everyone leaves the room is removed and joining it fails', async () => {
    const host = await rt.player('Maya');
    const { data } = await host.emitAck('room:create', {});
    await host.emitAck('room:leave', {});
    const ben = await rt.player('Ben');
    expect((await ben.emitAck('room:join', { code: data.code })).error.code).toBe('ROOM_NOT_FOUND');
  });
});

describe('what a player can receive', () => {
  test('events only reach players in the room', async () => {
    const host = await rt.player('Maya');
    const { data } = await host.emitAck('room:create', {});
    const outsider = await rt.player('Ben');
    const cy = await rt.player('Cyrus');
    await cy.emitAck('room:join', { code: data.code });
    await host.emitAck('room:updateSettings', settings(4, 9));
    await tick(50);
    expect(outsider.log.filter((e) => e.event.startsWith('room:'))).toEqual([]);
    expect(cy.count('room:settingsUpdated')).toBe(1);
  });

  test('a player cannot act on a room they are not in', async () => {
    const host = await rt.player('Maya');
    await host.emitAck('room:create', {});
    const ben = await rt.player('Ben');
    expect((await ben.emitAck('room:updateSettings', settings(4, 5))).error.code).toBe(
      'ROOM_NOT_FOUND',
    );
    expect((await ben.emitAck('game:start', {})).error.code).toBe('ROOM_NOT_FOUND');
  });

  test('a flood of events from one socket disconnects it and leaves others alone', async () => {
    const host = await rt.player('Maya');
    const { data } = await host.emitAck('room:create', {});
    const spammer = await rt.player('Ben');
    await spammer.emitAck('room:join', { code: data.code });
    for (let i = 0; i < 400; i += 1) spammer.socket.emit('time:sync');
    await tick(200);
    expect(spammer.socket.connected).toBe(false);
    expect((await host.emitAck('time:sync')).ok).toBe(true);
  });
});

describe('GET /api/rooms/:code', () => {
  test('returns the preview for a valid code and 404 ROOM_NOT_FOUND for an unknown one', async () => {
    const host = await rt.player('Maya');
    const { data } = await host.emitAck('room:create', settings(6, 12));
    const ben = await rt.player('Ben');
    const res = await request(rt.app)
      .get(`/api/rooms/${data.code.toLowerCase()}`)
      .set('Authorization', `Bearer ${ben.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      code: data.code,
      status: 'lobby',
      playerCount: 1,
      maxPlayers: 6,
      rounds: 12,
      hostNickname: 'Maya',
      players: [{ nickname: 'Maya', avatarColor: expect.any(String) }],
    });
    const missing = await request(rt.app)
      .get('/api/rooms/ZZZZZZ')
      .set('Authorization', `Bearer ${ben.token}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ROOM_NOT_FOUND');
    const junk = await request(rt.app)
      .get('/api/rooms/x')
      .set('Authorization', `Bearer ${ben.token}`);
    expect(junk.status).toBe(404);
  });

  test('needs a signed-in user', async () => {
    const res = await request(rt.app).get('/api/rooms/ABCDEF');
    expect(res.status).toBe(401);
  });
});
