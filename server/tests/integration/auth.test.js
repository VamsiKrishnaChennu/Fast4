import { Writable } from 'node:stream';
import jwt from 'jsonwebtoken';
import pino from 'pino';
import request from 'supertest';
import { Session } from '../../src/models/Session.js';
import { User } from '../../src/models/User.js';
import { createMemoryEmailProvider } from '../../src/services/emailService.js';
import { createTestApp, validEnvSource } from '../helpers/createTestApp.js';
import { clearDb, startTestDb, stopTestDb } from '../helpers/testDb.js';

const PASSWORD = 'Test1234';
const signupBody = (over = {}) => ({
  nickname: 'Maya',
  email: 'maya@example.com',
  password: PASSWORD,
  ageConfirmed: true,
  termsAccepted: true,
  ...over,
});
const refreshCookie = (res) =>
  (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('ff_refresh=')) ?? '';
const cookieValue = (res) => refreshCookie(res).split(';')[0];

let emailProvider;
let app;

beforeAll(startTestDb, 120_000);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearDb();
  emailProvider = createMemoryEmailProvider();
  app = createTestApp({ emailProvider });
});

const signup = (body = signupBody()) => request(app).post('/api/auth/signup').send(body);

describe('POST /api/auth/signup', () => {
  test('creates an account with an email and sets an httpOnly refresh cookie', async () => {
    const res = await signup();
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      nickname: 'Maya',
      email: 'maya@example.com',
      role: 'user',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion|sessions/);
    const cookie = refreshCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i);
  });

  test('creates an account with a phone number only', async () => {
    const res = await signup(signupBody({ email: undefined, phone: '+1 (415) 555-2671' }));
    expect(res.status).toBe(201);
    expect(res.body.user.phone).toBe('+14155552671');
  });

  test('refresh cookie is Secure when COOKIE_SECURE is on', async () => {
    const secure = createTestApp({ envSource: { COOKIE_SECURE: 'true' }, emailProvider });
    const res = await request(secure).post('/api/auth/signup').send(signupBody());
    expect(refreshCookie(res)).toMatch(/Secure/i);
  });

  test('needs an email or a phone number', async () => {
    const res = await signup(signupBody({ email: undefined }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('needs the age and terms confirmation and creates nothing without it', async () => {
    for (const over of [{ ageConfirmed: false }, { termsAccepted: false }]) {
      const res = await signup(signupBody(over));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AGE_REQUIRED');
    }
    expect(await User.countDocuments()).toBe(0);
  });

  test('rejects reserved and profane nicknames', async () => {
    for (const nickname of ['Admin', 'sup_port', 'f_u_c_k er']) {
      const res = await signup(signupBody({ nickname }));
      expect(res.status).toBe(400);
      expect(res.body.error.details[0].field).toBe('nickname');
    }
  });

  test('rejects a phone number that is not E.164', async () => {
    const res = await signup(signupBody({ email: undefined, phone: '12345' }));
    expect(res.status).toBe(400);
  });

  test('rejects weak passwords with field details', async () => {
    for (const password of ['short1', 'longpasswordnodigit', '12345678']) {
      const res = await signup(signupBody({ password }));
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d) => d.field === 'password')).toBe(true);
    }
  });

  test('rejects unknown fields', async () => {
    const res = await signup(signupBody({ role: 'admin' }));
    expect(res.status).toBe(400);
  });

  test('duplicate email, phone and nickname return CONFLICT naming the field', async () => {
    await signup(signupBody({ phone: '+14155552671' }));
    const cases = [
      [{ nickname: 'Other', email: 'maya@example.com' }, 'email'],
      [{ nickname: 'Other', email: 'other@example.com', phone: '+14155552671' }, 'phone'],
      [{ nickname: 'MAYA', email: 'other@example.com' }, 'nickname'],
    ];
    for (const [over, field] of cases) {
      const res = await signup(signupBody(over));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.details[0].field).toBe(field);
    }
  });

  test('stores the hash, never the password', async () => {
    await signup();
    const user = await User.findOne({ nicknameLower: 'maya' }).select('+passwordHash');
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.ageConfirmedAt).toBeInstanceOf(Date);
    expect(user.termsAcceptedAt).toBeInstanceOf(Date);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await signup(signupBody({ phone: '+14155552671' }));
  });
  const login = (identifier, password = PASSWORD) =>
    request(app).post('/api/auth/login').send({ identifier, password });

  test('logs in with the email, in any letter case', async () => {
    const res = await login('  MAYA@Example.com ');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).toMatch(/HttpOnly/i);
  });

  test('logs in with the phone number', async () => {
    expect((await login('+1 415 555 2671')).status).toBe(200);
  });

  test('wrong password and unknown user get the same answer', async () => {
    const wrong = await login('maya@example.com', 'Wrong1234');
    const unknown = await login('nobody@example.com');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.message).toBe('Invalid credentials.');
  });

  test('operator objects in the identifier are rejected', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  test('a banned account cannot log in', async () => {
    await User.updateOne({ nicknameLower: 'maya' }, { bannedAt: new Date() });
    const res = await login('maya@example.com');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('GET /api/auth/me and access tokens', () => {
  test('requires a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('returns the signed-in user', async () => {
    const { body } = await signup();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.nickname).toBe('Maya');
  });

  test('an expired token answers TOKEN_EXPIRED', async () => {
    const { body } = await signup();
    const expired = jwt.sign(
      { sub: body.user.id, role: 'user', tv: 0 },
      validEnvSource.JWT_ACCESS_SECRET,
      { expiresIn: -10 },
    );
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  test('tampered tokens, the none algorithm and a refresh token are all rejected', async () => {
    const { body } = await signup();
    const refresh = jwt.sign(
      { sub: body.user.id, tv: 0, jti: 'x' },
      validEnvSource.JWT_REFRESH_SECRET,
    );
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: body.user.id, role: 'admin', tv: 0 })).toString('base64url')}.`;
    const tampered = `${body.accessToken.slice(0, -3)}abc`;
    for (const token of [refresh, none, tampered, 'garbage']) {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });

  test('a token from before a password change stops working', async () => {
    const { body } = await signup();
    await User.updateOne({ _id: body.user.id }, { $inc: { tokenVersion: 1 } });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(401);
  });

  test('a banned user is blocked at once', async () => {
    const { body } = await signup();
    await User.updateOne({ _id: body.user.id }, { bannedAt: new Date() });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('refresh and logout', () => {
  test('rotates the refresh token and the old one stops working', async () => {
    const first = await signup();
    const oldCookie = cookieValue(first);
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    const newCookie = cookieValue(refreshed);
    expect(newCookie).not.toBe(oldCookie);

    const reused = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie);
    expect(reused.status).toBe(401);
    const again = await request(app).post('/api/auth/refresh').set('Cookie', newCookie);
    expect(again.status).toBe(200);
  });

  test('two devices keep separate sessions', async () => {
    await signup();
    const a = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'maya@example.com', password: PASSWORD });
    const b = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'maya@example.com', password: PASSWORD });
    expect(
      (await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(a))).status,
    ).toBe(200);
    expect(
      (await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(b))).status,
    ).toBe(200);
  });

  test('keeps at most ten sessions per account', async () => {
    await signup();
    for (let i = 0; i < 12; i += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'maya@example.com', password: PASSWORD });
    }
    expect(await Session.countDocuments()).toBe(10);
  });

  test('needs a cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  test('logout ends the session and clears the cookie', async () => {
    const first = await signup();
    const cookie = cookieValue(first);
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    expect(refreshCookie(out)).toMatch(/ff_refresh=;/);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  test('logout without a cookie still succeeds', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });

  test('refresh fails after the token version changes', async () => {
    const first = await signup();
    await User.updateOne({ _id: first.body.user.id }, { $inc: { tokenVersion: 1 } });
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(first));
    expect(res.status).toBe(401);
  });

  test('a forged refresh token is rejected', async () => {
    const first = await signup();
    const forged = jwt.sign(
      { sub: first.body.user.id, tv: 0, jti: 'nope' },
      validEnvSource.JWT_REFRESH_SECRET,
    );
    const res = await request(app).post('/api/auth/refresh').set('Cookie', `ff_refresh=${forged}`);
    expect(res.status).toBe(401);
  });
});

describe('password reset', () => {
  const tokenFromEmail = () => {
    const link = emailProvider.outbox.at(-1).text.match(/reset-password\?token=([\w-]+)/);
    return link[1];
  };
  const forgot = async (email) => {
    const res = await request(app).post('/api/auth/forgot').send({ email });
    await new Promise((resolve) => setTimeout(resolve, 20));
    return res;
  };

  beforeEach(signup);

  test('unknown and known emails get the same answer; only a known one gets an email', async () => {
    const unknown = await forgot('nobody@example.com');
    expect(unknown.status).toBe(204);
    expect(emailProvider.outbox).toHaveLength(0);
    const known = await forgot('maya@example.com');
    expect(known.status).toBe(204);
    expect(emailProvider.outbox).toHaveLength(1);
    expect(emailProvider.outbox[0]).toMatchObject({
      to: 'maya@example.com',
      subject: 'Reset your Fast Four password',
    });
  });

  test('the stored value is a hash, not the token', async () => {
    await forgot('maya@example.com');
    const token = tokenFromEmail();
    const user = await User.findOne({ nicknameLower: 'maya' }).select('+passwordResetTokenHash');
    expect(user.passwordResetTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(user.passwordResetTokenHash).not.toContain(token);
  });

  test('a valid link sets a new password, signs out everywhere and works once', async () => {
    const signedIn = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'maya@example.com', password: PASSWORD });
    await forgot('maya@example.com');
    const token = tokenFromEmail();
    const reset = await request(app).post('/api/auth/reset').send({ token, password: 'NewPass99' });
    expect(reset.status).toBe(204);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'maya@example.com', password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'maya@example.com', password: 'NewPass99' });
    expect(newLogin.status).toBe(200);
    expect(
      (await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(signedIn))).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      ).status,
    ).toBe(401);

    const reused = await request(app)
      .post('/api/auth/reset')
      .send({ token, password: 'Another123' });
    expect(reused.status).toBe(400);
    expect(reused.body.error.details[0].field).toBe('token');
  });

  test('an expired link is rejected', async () => {
    await forgot('maya@example.com');
    const token = tokenFromEmail();
    await User.updateOne(
      { nicknameLower: 'maya' },
      { passwordResetExpiresAt: new Date(Date.now() - 1000) },
    );
    const res = await request(app).post('/api/auth/reset').send({ token, password: 'NewPass99' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/invalid or has expired/);
  });

  test('a made-up token and a weak new password are rejected', async () => {
    const fake = await request(app)
      .post('/api/auth/reset')
      .send({ token: 'x'.repeat(43), password: 'NewPass99' });
    expect(fake.status).toBe(400);
    await forgot('maya@example.com');
    const weak = await request(app)
      .post('/api/auth/reset')
      .send({ token: tokenFromEmail(), password: 'weak' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.some((d) => d.field === 'password')).toBe(true);
  });

  test('a banned account gets no email', async () => {
    await User.updateOne({ nicknameLower: 'maya' }, { bannedAt: new Date() });
    expect((await forgot('maya@example.com')).status).toBe(204);
    expect(emailProvider.outbox).toHaveLength(0);
  });

  test('a failing email provider does not change the answer', async () => {
    const failing = { send: () => Promise.reject(new Error('smtp down')) };
    const failApp = createTestApp({ emailProvider: failing });
    const res = await request(failApp).post('/api/auth/forgot').send({ email: 'maya@example.com' });
    expect(res.status).toBe(204);
  });

  test('rejects bad input', async () => {
    expect((await request(app).post('/api/auth/forgot').send({ email: 'nope' })).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/auth/forgot')
          .send({ email: { $ne: 1 } })
      ).status,
    ).toBe(400);
  });
});

describe('rate limiting and logging', () => {
  test('more than the allowed auth attempts returns RATE_LIMITED', async () => {
    const limited = createTestApp({ authLimit: { limit: 3, windowMs: 60_000 } });
    const attempt = () =>
      request(limited).post('/api/auth/login').send({ identifier: 'a@b.co', password: 'x' });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const res = await attempt();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  test('logs never contain passwords, tokens or hashes', async () => {
    const lines = [];
    const sink = new Writable({
      write(chunk, enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const logger = pino({ level: 'debug' }, sink);
    const logged = createTestApp({ logger, emailProvider });
    const res = await request(logged)
      .post('/api/auth/signup')
      .send(signupBody({ nickname: 'Logger', email: 'log@example.com' }));
    await request(logged)
      .post('/api/auth/login')
      .send({ identifier: 'log@example.com', password: PASSWORD });
    await request(logged).post('/api/auth/forgot').send({ email: 'log@example.com' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const all = lines.join('');
    expect(all.length).toBeGreaterThan(0);
    expect(all).not.toContain(PASSWORD);
    expect(all).not.toContain(res.body.accessToken);
    expect(all).not.toMatch(/\$2[aby]\$/);
    expect(all).not.toContain(emailProvider.outbox.at(-1).text.match(/token=([\w-]+)/)[1]);
  });
});
