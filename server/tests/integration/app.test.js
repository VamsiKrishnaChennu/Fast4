import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { LIMITS, LETTER_POOL } from '@fastfour/shared';
import { createTestApp } from '../helpers/createTestApp.js';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'dist');

describe('health and readiness', () => {
  test('GET /health is always ok, at the root and under /api', async () => {
    const app = createTestApp();
    for (const url of ['/health', '/api/health']) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    }
  });

  test('GET /ready is 200 when every check passes', async () => {
    const app = createTestApp({ readinessChecks: [{ name: 'database', check: () => true }] });
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', checks: { database: true } });
  });

  test('GET /ready is 503 when a check fails or throws', async () => {
    const app = createTestApp({
      readinessChecks: [
        { name: 'database', check: () => false },
        {
          name: 'dictionary',
          check: () => {
            throw new Error('x');
          },
        },
      ],
    });
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.checks).toEqual({ database: false, dictionary: false });
  });
});

describe('GET /api/meta/config', () => {
  test('returns limits that match the shared constants', async () => {
    const res = await request(createTestApp()).get('/api/meta/config');
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.limits.ROUND_SECONDS).toBe(60);
    expect(data.limits.CHALLENGES_PER_PLAYER).toBe(LIMITS.CHALLENGES_PER_PLAYER);
    expect(data.letterPool).toEqual(LETTER_POOL);
    expect(data.scoring.FIRST_FINISHER_BONUS).toBe(5);
    expect(data.categories).toEqual(['name', 'place', 'animal', 'thing']);
  });
});

describe('errors and hardening', () => {
  test('unknown routes return the JSON 404', async () => {
    const res = await request(createTestApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('malformed JSON returns 400 and never a stack trace', async () => {
    const res = await request(createTestApp())
      .post('/api/meta/config')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });

  test('bodies over 10 KB are rejected', async () => {
    const res = await request(createTestApp())
      .post('/api/meta/config')
      .send({ big: 'x'.repeat(11_000) });
    expect(res.status).toBe(400);
  });

  test('sets security headers and hides x-powered-by', async () => {
    const res = await request(createTestApp()).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  test('production adds HSTS and a websocket origin to the CSP', async () => {
    const app = createTestApp({
      envSource: {
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://fastfour.example.com',
        SUPPORT_EMAIL: 'creatiquework@gmail.com',
        WIKIDATA_USER_AGENT: 'FastFour/1.0 (creatiquework@gmail.com)',
      },
    });
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toContain('max-age=15552000');
    expect(res.headers['content-security-policy']).toContain('wss://fastfour.example.com');
    expect(res.headers['content-security-policy']).toContain('upgrade-insecure-requests');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('echoes a request id', async () => {
    const res = await request(createTestApp()).get('/health').set('x-request-id', 'trace-1');
    expect(res.headers['x-request-id']).toBe('trace-1');
  });

  test('the API is rate limited with the standard error body', async () => {
    const app = createTestApp({ apiLimit: { limit: 2, windowMs: 60_000 } });
    await request(app).get('/api/meta/config');
    await request(app).get('/api/meta/config');
    const res = await request(app).get('/api/meta/config');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  test('development allows the client origin with credentials', async () => {
    const res = await request(createTestApp())
      .get('/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('serving the built client', () => {
  const app = () => createTestApp({ clientDist: dist });

  test('serves index.html for app routes without caching', async () => {
    const res = await request(app()).get('/room/ABC123');
    expect(res.status).toBe(200);
    expect(res.text).toContain('app');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  test('caches fingerprinted assets for a year', async () => {
    const res = await request(app()).get('/assets/app-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('missing files and unknown API routes are JSON 404s, not the app shell', async () => {
    const missing = await request(app()).get('/assets/missing.js');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    const api = await request(app()).get('/api/unknown');
    expect(api.status).toBe(404);
    expect(api.headers['content-type']).toContain('json');
  });
});
