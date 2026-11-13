import request from 'supertest';
import { loadEnv } from '../../src/config/env.js';
import { createTestApp, validEnvSource } from '../helpers/createTestApp.js';

const PRINT = Array.from({ length: 32 }, (_, i) =>
  i.toString(16).padStart(2, '0').toUpperCase(),
).join(':');
const PRINT2 = Array.from({ length: 32 }, () => 'AB').join(':');

describe('/.well-known/assetlinks.json', () => {
  test('is served as JSON with the package and every fingerprint', async () => {
    const app = createTestApp({
      envSource: {
        ANDROID_PACKAGE_NAME: 'com.npatarena.app',
        ANDROID_SHA256_FINGERPRINTS: `${PRINT.toLowerCase()}, ${PRINT2}`,
      },
    });
    const res = await request(app).get('/.well-known/assetlinks.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.npatarena.app',
          sha256_cert_fingerprints: [PRINT, PRINT2],
        },
      },
    ]);
  });

  test('answers 404 until it is configured', async () => {
    const res = await request(createTestApp({})).get('/.well-known/assetlinks.json');
    expect(res.status).toBe(404);
  });

  test('settings are checked at startup', () => {
    const load = (extra) => () => loadEnv({ ...validEnvSource, ...extra });
    expect(load({ ANDROID_PACKAGE_NAME: 'com.npatarena.app' })).toThrow(/go together/);
    expect(load({ ANDROID_SHA256_FINGERPRINTS: PRINT })).toThrow(/go together/);
    expect(load({ ANDROID_PACKAGE_NAME: 'nodots', ANDROID_SHA256_FINGERPRINTS: PRINT })).toThrow(
      /com\.example/,
    );
    expect(load({ ANDROID_PACKAGE_NAME: 'com.a.b', ANDROID_SHA256_FINGERPRINTS: 'AA:BB' })).toThrow(
      /fingerprints/,
    );
    expect(
      load({ ANDROID_PACKAGE_NAME: 'com.a.b', ANDROID_SHA256_FINGERPRINTS: PRINT }),
    ).not.toThrow();
  });
});
