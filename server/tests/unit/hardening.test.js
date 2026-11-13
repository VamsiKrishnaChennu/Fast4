import { jest } from '@jest/globals';
import { createLogger } from '../../src/config/logger.js';
import { createErrorReporter } from '../../src/services/errorReporter.js';
import { createMetricsService } from '../../src/services/metricsService.js';
import { createTokenBucket } from '../../src/utils/tokenBucket.js';

describe('token bucket', () => {
  test('allows a burst up to the capacity, then refills evenly', () => {
    const bucket = createTokenBucket({ capacity: 30, windowMs: 10_000 });
    for (let i = 0; i < 30; i += 1) expect(bucket.take(1000)).toBe(true);
    expect(bucket.take(1000)).toBe(false);
    // 10 seconds hold 30 tokens, so one token comes back every 333 ms.
    expect(bucket.take(1000 + 340)).toBe(true);
    expect(bucket.take(1000 + 340)).toBe(false);
    expect(bucket.take(1000 + 340 + 10_000)).toBe(true);
  });

  test('never holds more than the capacity', () => {
    const bucket = createTokenBucket({ capacity: 3, windowMs: 1000 });
    bucket.take(0);
    for (let i = 0; i < 3; i += 1) expect(bucket.take(1_000_000)).toBe(true);
    expect(bucket.take(1_000_000)).toBe(false);
  });
});

const quiet = { warn: jest.fn(), error: jest.fn() };

describe('error reporter', () => {
  test('without a DSN it does nothing and never loads Sentry', async () => {
    const load = jest.fn();
    const reporter = createErrorReporter({ env: { NODE_ENV: 'test' }, logger: quiet, load });
    await reporter.ready();
    reporter.capture(new Error('x'));
    await reporter.flush();
    expect(load).not.toHaveBeenCalled();
  });

  test('with a DSN it starts Sentry without personal data and reports errors', async () => {
    const sentry = {
      init: jest.fn(),
      captureException: jest.fn(),
      flush: jest.fn(async () => true),
    };
    const reporter = createErrorReporter({
      env: {
        SENTRY_DSN: 'https://k@example.ingest.sentry.io/1',
        NODE_ENV: 'production',
        APP_VERSION: '1.2.3',
      },
      logger: quiet,
      load: async () => sentry,
    });
    await reporter.ready();
    const options = sentry.init.mock.calls[0][0];
    expect(options).toMatchObject({
      environment: 'production',
      release: '1.2.3',
      sendDefaultPii: false,
    });
    const event = options.beforeSend({
      message: 'm',
      request: { headers: { cookie: 'a' }, cookies: { a: 1 }, data: { password: 'p' }, url: '/x' },
    });
    expect(event.request).toEqual({ url: '/x' });
    const err = new Error('boom');
    reporter.capture(err, { reqId: 'r1' });
    expect(sentry.captureException).toHaveBeenCalledWith(err, { extra: { reqId: 'r1' } });
    await reporter.flush(500);
    expect(sentry.flush).toHaveBeenCalledWith(500);
  });

  test('a missing Sentry package or a failing report never throws', async () => {
    const logger = { warn: jest.fn() };
    const reporter = createErrorReporter({
      env: { SENTRY_DSN: 'https://k@example.ingest.sentry.io/1', NODE_ENV: 'test' },
      logger,
      load: async () => {
        throw new Error('Cannot find package');
      },
    });
    await reporter.ready();
    expect(logger.warn).toHaveBeenCalled();
    expect(() => reporter.capture(new Error('x'))).not.toThrow();

    const broken = {
      init: jest.fn(),
      captureException: jest.fn(() => {
        throw new Error('down');
      }),
      flush: jest.fn(async () => {
        throw new Error('down');
      }),
    };
    const r2 = createErrorReporter({
      env: { SENTRY_DSN: 'https://k@example.ingest.sentry.io/1', NODE_ENV: 'test' },
      logger,
      load: async () => broken,
    });
    await r2.ready();
    expect(() => r2.capture(new Error('x'))).not.toThrow();
    await expect(r2.flush()).resolves.toBeUndefined();
  });
});

describe('metrics', () => {
  test('reports rooms, sockets, lag, memory and game counters', () => {
    const metrics = createMetricsService({ roomCount: () => 3, socketCount: () => 7 });
    metrics.count('gamesStarted');
    metrics.count('gamesStarted');
    metrics.count('gamesFinished');
    metrics.count('somethingElse');
    const snap = metrics.snapshot();
    metrics.stop();
    expect(snap).toMatchObject({
      rooms: 3,
      sockets: 7,
      games: { gamesStarted: 2, gamesFinished: 1, gamesAbandoned: 0 },
    });
    expect(snap.memoryMb.heapUsed).toBeGreaterThan(0);
    expect(snap.eventLoopLagMs).toEqual({ mean: expect.any(Number), p99: expect.any(Number) });
  });
});

describe('log redaction', () => {
  test('tokens, cookies, emails and phones never reach the log', () => {
    const lines = [];
    const logger = createLogger(
      { NODE_ENV: 'development', LOG_LEVEL: 'info' },
      { write: (l) => lines.push(l) },
    );
    logger.info(
      {
        req: { headers: { authorization: 'Bearer abc', cookie: 'ff_refresh=zzz' } },
        user: { email: 'maya@example.com', phone: '+15555550100' },
        refreshToken: 'rrr',
        password: 'hunter2',
      },
      'event',
    );
    const out = lines.join('');
    for (const secret of [
      'Bearer abc',
      'zzz',
      'maya@example.com',
      '+15555550100',
      'rrr',
      'hunter2',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[redacted]');
  });
});
