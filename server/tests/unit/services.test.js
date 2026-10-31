import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AppError } from '../../src/utils/AppError.js';
import { ttlToMs } from '../../src/utils/ttl.js';
import { parseCookies } from '../../src/utils/cookies.js';
import { maskEmail } from '../../src/utils/maskEmail.js';
import {
  createResetToken,
  createTokenService,
  hashToken,
} from '../../src/services/tokenService.js';
import {
  buildResetEmail,
  createConsoleEmailProvider,
  createEmailProvider,
  createMemoryEmailProvider,
  createSmtpEmailProvider,
} from '../../src/services/emailService.js';
import { createAuth } from '../../src/middleware/auth.js';
import { toPublicUser } from '../../src/services/userService.js';
import { loadEnv } from '../../src/config/env.js';
import { validEnvSource } from '../helpers/createTestApp.js';

const env = loadEnv(validEnvSource);

describe('ttlToMs', () => {
  test('parses seconds, minutes, hours and days', () => {
    expect(ttlToMs('30s')).toBe(30_000);
    expect(ttlToMs('15m')).toBe(900_000);
    expect(ttlToMs('2h')).toBe(7_200_000);
    expect(ttlToMs('7d')).toBe(604_800_000);
  });
  test('rejects other formats', () => {
    expect(() => ttlToMs('soon')).toThrow(/Invalid duration/);
  });
});

describe('parseCookies', () => {
  test('reads several cookies and decodes values', () => {
    expect(parseCookies('a=1; ff_refresh=abc%20def; empty=')).toEqual({
      a: '1',
      ff_refresh: 'abc def',
      empty: '',
    });
  });
  test('handles missing and broken headers', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('novalue; =x; bad=%E0%A4%A')).toEqual({ bad: '%E0%A4%A' });
  });
});

describe('maskEmail', () => {
  test('keeps the first letter and the domain', () => {
    expect(maskEmail('maya@gmail.com')).toBe('m***@gmail.com');
  });
});

describe('tokenService', () => {
  const tokens = createTokenService(env);
  const user = { _id: 'u1', role: 'user', tokenVersion: 2 };

  test('access tokens carry sub, role and tv and verify', () => {
    const payload = tokens.verifyAccess(tokens.signAccess(user));
    expect(payload).toMatchObject({ sub: 'u1', role: 'user', tv: 2 });
  });

  test('refresh tokens carry a unique jti and an expiry date', () => {
    const a = tokens.signRefresh(user);
    const b = tokens.signRefresh(user);
    expect(a.jti).not.toBe(b.jti);
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(tokens.verifyRefresh(a.token)).toMatchObject({ sub: 'u1', tv: 2, jti: a.jti });
  });

  test('access and refresh tokens are not interchangeable', () => {
    expect(() => tokens.verifyAccess(tokens.signRefresh(user).token)).toThrow(AppError);
    expect(() => tokens.verifyRefresh(tokens.signAccess(user))).toThrow(AppError);
  });

  test('an expired access token says TOKEN_EXPIRED, a bad one UNAUTHENTICATED', () => {
    const expired = jwt.sign({ sub: 'u1' }, env.JWT_ACCESS_SECRET, { expiresIn: -5 });
    expect(() => tokens.verifyAccess(expired)).toThrow(
      expect.objectContaining({ code: 'TOKEN_EXPIRED' }),
    );
    expect(() => tokens.verifyAccess('nope')).toThrow(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
  });

  test('reset tokens are long, random and stored only as a hash', () => {
    const a = createResetToken();
    const b = createResetToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});

describe('email providers', () => {
  const logger = { info: jest.fn() };

  test('console provider logs a masked address and hides the body outside development', async () => {
    logger.info.mockClear();
    await createConsoleEmailProvider({ env, logger }).send({
      to: 'maya@gmail.com',
      subject: 'Hi',
      text: 'secret link',
    });
    const [fields] = logger.info.mock.calls[0];
    expect(fields.to).toBe('m***@gmail.com');
    expect(fields.body).toBeUndefined();
  });

  test('console provider shows the body in development', async () => {
    logger.info.mockClear();
    const dev = loadEnv({ ...validEnvSource, NODE_ENV: 'development' });
    await createConsoleEmailProvider({ env: dev, logger }).send({
      to: 'a@b.co',
      subject: 'Hi',
      text: 'the link',
    });
    expect(logger.info.mock.calls[0][0].body).toBe('the link');
  });

  test('smtp provider sends through the transport with the configured sender', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const smtpEnv = loadEnv({
      ...validEnvSource,
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'a@b.co',
      SMTP_PASS: 'pw',
      EMAIL_FROM: 'Fast Four <a@b.co>',
    });
    const provider = createSmtpEmailProvider({ env: smtpEnv, logger, transport: { sendMail } });
    await provider.send({ to: 'x@y.co', subject: 'S', text: 'T', html: '<p>T</p>' });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Fast Four <a@b.co>',
      to: 'x@y.co',
      subject: 'S',
      text: 'T',
      html: '<p>T</p>',
    });
  });

  test('smtp provider builds its own transport when none is given', () => {
    const smtpEnv = loadEnv({
      ...validEnvSource,
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'a@b.co',
      SMTP_PASS: 'pw',
      EMAIL_FROM: 'a@b.co',
    });
    expect(typeof createEmailProvider({ env: smtpEnv, logger }).send).toBe('function');
    expect(typeof createEmailProvider({ env, logger }).send).toBe('function');
  });

  test('memory provider keeps messages', async () => {
    const memory = createMemoryEmailProvider();
    await memory.send({ to: 'a@b.co' });
    expect(memory.outbox).toHaveLength(1);
  });

  test('reset email contains the link, the time limit and an ignore notice', () => {
    const mail = buildResetEmail({ link: 'https://x.test/reset-password?token=abc', minutes: 30 });
    expect(mail.subject).toBe('Reset your Fast Four password');
    expect(mail.text).toContain('https://x.test/reset-password?token=abc');
    expect(mail.text).toContain('30 minutes');
    expect(mail.text).toContain('ignore this email');
    expect(mail.html).toContain('href="https://x.test/reset-password?token=abc"');
  });
});

describe('requireAdmin and public user shape', () => {
  const { requireAdmin } = createAuth({ tokenService: createTokenService(env) });

  test('lets admins through and blocks everyone else', () => {
    const next = jest.fn();
    requireAdmin({ auth: { role: 'admin' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
    const blocked = jest.fn();
    requireAdmin({ auth: { role: 'user' } }, {}, blocked);
    expect(blocked.mock.calls[0][0].code).toBe('FORBIDDEN');
  });

  test('toPublicUser never exposes secrets and flattens bestByRounds', () => {
    const user = toPublicUser({
      _id: 'u1',
      nickname: 'Maya',
      avatarColor: '#fff',
      role: 'user',
      isVerified: false,
      passwordHash: 'x',
      tokenVersion: 3,
      stats: { groupWins: 1, bestByRounds: new Map([['10', 412]]) },
    });
    expect(user.stats.bestByRounds).toEqual({ 10: 412 });
    expect(user.email).toBeNull();
    expect(JSON.stringify(user)).not.toMatch(/passwordHash|tokenVersion/);
  });
});
