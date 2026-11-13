import jwt from 'jsonwebtoken';
import request from 'supertest';
import { User } from '../../src/models/User.js';
import { createTestApp } from '../helpers/createTestApp.js';
import { startRealtimeServer } from '../helpers/realtimeHelpers.js';
import { signUp } from '../helpers/singleHelpers.js';
import { clearDb, startTestDb, stopTestDb } from '../helpers/testDb.js';

beforeAll(startTestDb, 120_000);
afterAll(stopTestDb);
beforeEach(clearDb);

const ACCESS = 'a'.repeat(32);
const REFRESH = 'b'.repeat(32);

describe('token tampering', () => {
  let app;
  let me;
  beforeEach(async () => {
    app = createTestApp({});
    me = await signUp(app, 'Maya');
  });
  const asToken = (token) =>
    request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  const payload = () => jwt.decode(me.token);

  test('the real token works', async () => {
    expect((await asToken(me.token)).status).toBe(200);
  });

  test('a changed payload, a wrong secret and the none algorithm are refused', async () => {
    const [h, , s] = me.token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload(), role: 'admin' })).toString(
      'base64url',
    );
    expect((await asToken(`${h}.${forged}.${s}`)).status).toBe(401);
    expect((await asToken(jwt.sign(payload(), 'x'.repeat(32)))).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify(payload()),
    ).toString('base64url')}.`;
    expect((await asToken(none)).status).toBe(401);
  });

  test('a refresh token or an expired token is not an access token', async () => {
    const { sub, tv } = payload();
    expect((await asToken(jwt.sign({ sub, tv }, REFRESH, { expiresIn: '7d' }))).status).toBe(401);
    const expired = jwt.sign({ sub, tv }, ACCESS, { expiresIn: -10 });
    const res = await asToken(expired);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  test('a token from before a password reset or ban (old tokenVersion) is refused', async () => {
    await User.updateOne({ _id: payload().sub }, { $inc: { tokenVersion: 1 } });
    expect((await asToken(me.token)).status).toBe(401);
  });
});

describe('injection', () => {
  test('Mongo operators where text is expected are rejected', async () => {
    const app = createTestApp({});
    await signUp(app, 'Maya');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: { $ne: null }, password: { $ne: null } });
    expect(login.status).toBe(400);
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({
        nickname: { $gt: '' },
        email: 'x@example.com',
        password: 'Test1234',
        ageConfirmed: true,
        termsAccepted: true,
      });
    expect(signup.status).toBe(400);
  });

  test('unknown fields are rejected, not stored', async () => {
    const app = createTestApp({});
    const res = await request(app).post('/api/auth/signup').send({
      nickname: 'Maya',
      email: 'maya@example.com',
      password: 'Test1234',
      ageConfirmed: true,
      termsAccepted: true,
      role: 'admin',
    });
    expect(res.status).toBe(400);
    expect(await User.countDocuments({})).toBe(0);
  });
});

describe('production headers and errors', () => {
  const production = {
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://fastfour.example.com',
    SUPPORT_EMAIL: 'help@example.com',
    WIKIDATA_USER_AGENT: 'FastFour/1.0 (help@example.com)',
  };
  test('HSTS, CSP and the rest are sent and nothing leaks', async () => {
    let app;
    try {
      app = createTestApp({ envSource: production });
    } catch (err) {
      throw new Error(`production env needs more settings: ${err.message}`);
    }
    const res = await request(app).get('/api/health');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limits', () => {
  test('login is limited per IP and the answer is the standard error', async () => {
    const app = createTestApp({ authLimit: { limit: 3 } });
    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'a@example.com', password: 'Nope1234' });
    }
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'a@example.com', password: 'Nope1234' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  test('the general API limit applies', async () => {
    const app = createTestApp({ apiLimit: { limit: 5 } });
    const statuses = [];
    for (let i = 0; i < 7; i += 1)
      statuses.push((await request(app).get('/api/meta/config')).status);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });
});

describe('socket abuse', () => {
  let rt;
  beforeEach(async () => {
    rt = await startRealtimeServer({});
  });
  afterEach(() => rt.close());

  test('a socket gets RATE_LIMITED after 30 events and other sockets are unaffected', async () => {
    const noisy = await rt.player('Maya');
    const calm = await rt.player('Ben');
    const acks = [];
    for (let i = 0; i < 40; i += 1) acks.push(await noisy.emitAck('time:sync', {}));
    expect(acks.slice(0, 30).every((a) => a.ok)).toBe(true);
    expect(acks.slice(30).every((a) => a.error?.code === 'RATE_LIMITED')).toBe(true);
    expect((await calm.emitAck('time:sync', {})).ok).toBe(true);
  });

  test('an unknown or vote event is ignored and the server keeps working', async () => {
    const p = await rt.player('Maya');
    p.socket.emit('challenge:vote', { vote: 'yes' });
    p.socket.emit('admin:ban', { userId: 'x' });
    expect((await p.emitAck('time:sync', {})).ok).toBe(true);
    expect(p.socket.connected).toBe(true);
  });

  test('room events from someone outside any room are refused', async () => {
    const p = await rt.player('Maya');
    expect(
      (
        await p.emitAck('answer:submit', {
          roundIndex: 0,
          answers: { name: 'a', place: 'a', animal: 'a', thing: 'a' },
        })
      ).ok,
    ).toBe(false);
    expect((await p.emitAck('review:skip', {})).ok).toBe(false);
    expect((await p.emitAck('game:start', {})).ok).toBe(false);
    expect((await p.emitAck('room:kick', { userId: '64b000000000000000000000' })).ok).toBe(false);
  });
});

describe('admin metrics', () => {
  let rt;
  beforeEach(async () => {
    rt = await startRealtimeServer({});
  });
  afterEach(() => rt.close());

  test('only admins see rooms, sockets, lag and memory', async () => {
    const user = await rt.player('Maya');
    const admin = await rt.player('Boss1');
    await User.updateOne({ _id: admin.user.id }, { role: 'admin' });
    await user.emitAck('room:create', { settings: { maxPlayers: 8, rounds: 5 } });
    expect((await request(rt.app).get('/api/admin/metrics')).status).toBe(401);
    expect(
      (await request(rt.app).get('/api/admin/metrics').set('Authorization', `Bearer ${user.token}`))
        .status,
    ).toBe(403);
    const res = await request(rt.app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rooms: 1, sockets: 2 });
    expect(res.body.memoryMb.heapUsed).toBeGreaterThan(0);
  });
});
