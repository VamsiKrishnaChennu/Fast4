import { EnvError, loadEnv } from '../../src/config/env.js';
import { validEnvSource } from '../helpers/createTestApp.js';

const prodSource = {
  ...validEnvSource,
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://fastfour.example.com',
  SUPPORT_EMAIL: 'creatiquework@gmail.com',
  WIKIDATA_USER_AGENT: 'FastFour/1.0 (creatiquework@gmail.com)',
};

describe('loadEnv', () => {
  test('accepts a minimal valid environment and applies defaults', () => {
    const env = loadEnv(validEnvSource);
    expect(env.PORT).toBe(4000);
    expect(env.JUDGE_ENABLED).toBe(true);
    expect(env.OTP_VERIFICATION_ENABLED).toBe(false);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.ROUND_SECONDS).toBe(60);
  });

  test('names every missing required variable', () => {
    let error;
    try {
      loadEnv({ NODE_ENV: 'test' });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(EnvError);
    expect(error.message).toContain('MONGODB_URI');
    expect(error.message).toContain('JWT_ACCESS_SECRET');
    expect(error.message).toContain('JWT_REFRESH_SECRET');
  });

  test('rejects short secrets, identical secrets and a bad Mongo URI', () => {
    expect(() => loadEnv({ ...validEnvSource, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() =>
      loadEnv({ ...validEnvSource, JWT_REFRESH_SECRET: validEnvSource.JWT_ACCESS_SECRET }),
    ).toThrow(/JWT_REFRESH_SECRET: must differ/);
    expect(() => loadEnv({ ...validEnvSource, MONGODB_URI: 'http://nope' })).toThrow(/MONGODB_URI/);
  });

  test('treats empty strings as not set', () => {
    expect(() => loadEnv({ ...validEnvSource, MONGODB_URI: '' })).toThrow(/MONGODB_URI/);
    expect(loadEnv({ ...validEnvSource, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
  });

  test('production requires the public settings and defaults cookies to secure', () => {
    const env = loadEnv(prodSource);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.isProduction).toBe(true);
    for (const name of ['APP_ORIGIN', 'SUPPORT_EMAIL', 'WIKIDATA_USER_AGENT']) {
      const source = { ...prodSource };
      delete source[name];
      expect(() => loadEnv(source)).toThrow(new RegExp(`${name}: required in production`));
    }
    expect(() => loadEnv({ ...prodSource, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });

  test('smtp provider needs its credentials', () => {
    expect(() => loadEnv({ ...validEnvSource, EMAIL_PROVIDER: 'smtp' })).toThrow(/SMTP_PASS/);
    const env = loadEnv({
      ...validEnvSource,
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'a@b.co',
      SMTP_PASS: 'secret',
      EMAIL_FROM: 'Fast Four <a@b.co>',
    });
    expect(env.EMAIL_PROVIDER).toBe('smtp');
  });

  test('TEST_ROUND_SECONDS is honored only when NODE_ENV is test', () => {
    expect(loadEnv({ ...validEnvSource, TEST_ROUND_SECONDS: '8' }).ROUND_SECONDS).toBe(8);
    expect(loadEnv({ ...prodSource, TEST_ROUND_SECONDS: '8' }).ROUND_SECONDS).toBe(60);
    expect(
      loadEnv({ ...validEnvSource, NODE_ENV: 'development', TEST_ROUND_SECONDS: '8' })
        .ROUND_SECONDS,
    ).toBe(60);
  });
});
