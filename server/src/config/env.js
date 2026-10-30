import { existsSync } from 'node:fs';
import { z } from 'zod';
import { LIMITS } from '@fastfour/shared';

/** Thrown when the environment is missing or invalid. The message names every bad variable. */
export class EnvError extends Error {
  constructor(problems) {
    super(
      `Invalid environment configuration:\n${problems.map((p) => `  - ${p.name}: ${p.message}`).join('\n')}`,
    );
    this.name = 'EnvError';
    this.problems = problems;
  }
}

const bool = (fallback) =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL: z.string().default('7d'),
    CLIENT_ORIGIN: z.url().default('http://localhost:5173'),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    OTP_VERIFICATION_ENABLED: bool('false'),
    JUDGE_ENABLED: bool('true'),
    WIKIDATA_USER_AGENT: z.string().optional(),
    DICTIONARY_API_URL: z.url().default('https://api.dictionaryapi.dev/api/v2/entries/en'),
    WIKIDATA_API_URL: z.url().default('https://www.wikidata.org/w/api.php'),
    WIKIDATA_SPARQL_URL: z.url().default('https://query.wikidata.org/sparql'),
    APP_ORIGIN: z.url().optional(),
    ANDROID_PACKAGE_NAME: z.string().optional(),
    ANDROID_SHA256_FINGERPRINTS: z.string().optional(),
    SUPPORT_EMAIL: z.email().optional(),
    EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
    APP_VERSION: z.string().default('dev'),
    TEST_ROUND_SECONDS: z.coerce.number().int().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    const need = (name, when, why) => {
      if (when && env[name] === undefined) {
        ctx.addIssue({ code: 'custom', path: [name], message: `required ${why}` });
      }
    };
    const prod = env.NODE_ENV === 'production';
    for (const name of ['APP_ORIGIN', 'SUPPORT_EMAIL', 'WIKIDATA_USER_AGENT']) {
      need(name, prod, 'in production');
    }
    for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']) {
      need(name, env.EMAIL_PROVIDER === 'smtp', 'when EMAIL_PROVIDER is smtp');
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_ACCESS_SECRET',
      });
    }
    if (prod && env.COOKIE_SECURE === false) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must not be false in production',
      });
    }
  });

/**
 * Loads server/.env into process.env when the file exists. Real environment variables win.
 * @param {string|URL} file
 */
export function loadEnvFile(file) {
  if (existsSync(file)) process.loadEnvFile(file);
}

/**
 * Validates environment variables and returns the typed configuration.
 * @param {Record<string, string|undefined>} [source]
 * @returns {object} config; every key keeps its environment variable name
 * @throws {EnvError} naming each missing or invalid variable
 */
export function loadEnv(source = process.env) {
  // Empty strings count as "not set" so an empty line in .env behaves like a missing one.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((i) => ({
        name: i.path.join('.') || 'environment',
        message: i.message.includes('received undefined') ? 'is required' : i.message,
      })),
    );
  }
  const env = result.data;
  const production = env.NODE_ENV === 'production';
  return {
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? production,
    // Honored only when NODE_ENV is test; ignored everywhere else.
    ROUND_SECONDS:
      env.NODE_ENV === 'test' && env.TEST_ROUND_SECONDS
        ? env.TEST_ROUND_SECONDS
        : LIMITS.ROUND_SECONDS,
    TEST_ROUND_SECONDS: undefined,
    isProduction: production,
  };
}
