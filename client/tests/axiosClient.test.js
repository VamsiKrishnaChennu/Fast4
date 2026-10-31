import { describe, expect, test, vi } from 'vitest';
import {
  api,
  getAccessToken,
  hasSessionHint,
  readApiError,
  setAccessToken,
  setAuthLostHandler,
  setSessionHint,
} from '../src/api/axiosClient.js';
import { apiError, installFakeServer } from './helpers/fakeServer.js';

describe('access token handling', () => {
  test('sends the Bearer token kept in memory', async () => {
    const server = installFakeServer({ 'GET /auth/me': () => ({ data: { user: {} } }) });
    setAccessToken('abc');
    await api.get('/auth/me');
    expect(server.calls[0].auth).toBe('Bearer abc');
    expect(localStorage.getItem('ff-access')).toBeNull();
  });

  test('refreshes once on TOKEN_EXPIRED and retries the request', async () => {
    let first = true;
    const server = installFakeServer({
      'GET /auth/me': () => {
        if (first) {
          first = false;
          return apiError(401, 'TOKEN_EXPIRED', 'expired');
        }
        return { data: { user: { id: 1 } } };
      },
      'POST /auth/refresh': () => ({ data: { accessToken: 'fresh' } }),
    });
    setAccessToken('old');
    const res = await api.get('/auth/me');
    expect(res.data.user.id).toBe(1);
    expect(server.calls.map((c) => c.key)).toEqual([
      'GET /auth/me',
      'POST /auth/refresh',
      'GET /auth/me',
    ]);
    expect(server.calls[2].auth).toBe('Bearer fresh');
    expect(getAccessToken()).toBe('fresh');
    expect(hasSessionHint()).toBe(true);
  });

  test('parallel expired requests share one refresh call', async () => {
    const expired = new Set();
    const server = installFakeServer({
      'GET /a': (config) => {
        if (config.headers.Authorization === 'Bearer old')
          return apiError(401, 'TOKEN_EXPIRED', 'x');
        return { data: 'a' };
      },
      'GET /b': (config) => {
        if (config.headers.Authorization === 'Bearer old')
          return apiError(401, 'TOKEN_EXPIRED', 'x');
        return { data: 'b' };
      },
      'POST /auth/refresh': async () => {
        expired.add(1);
        await new Promise((r) => setTimeout(r, 10));
        return { data: { accessToken: 'fresh' } };
      },
    });
    setAccessToken('old');
    const [a, b] = await Promise.all([api.get('/a'), api.get('/b')]);
    expect([a.data, b.data]).toEqual(['a', 'b']);
    expect(server.calls.filter((c) => c.key === 'POST /auth/refresh')).toHaveLength(1);
  });

  test('a failed refresh signs the player out', async () => {
    installFakeServer({
      'GET /auth/me': () => apiError(401, 'TOKEN_EXPIRED', 'x'),
      'POST /auth/refresh': () => apiError(401, 'UNAUTHENTICATED', 'Please log in.'),
    });
    const lost = vi.fn();
    setAuthLostHandler(lost);
    setAccessToken('old');
    setSessionHint(true);
    await expect(api.get('/auth/me')).rejects.toBeTruthy();
    expect(lost).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(hasSessionHint()).toBe(false);
  });

  test('other 401s are not retried', async () => {
    const server = installFakeServer({ 'GET /x': () => apiError(401, 'UNAUTHENTICATED', 'no') });
    await expect(api.get('/x')).rejects.toBeTruthy();
    expect(server.calls).toHaveLength(1);
  });
});

describe('readApiError', () => {
  test('maps server errors, field details and network failures', () => {
    const err = {
      response: {
        data: {
          error: {
            code: 'CONFLICT',
            message: 'In use',
            details: [{ field: 'email', message: 'Taken' }],
          },
        },
      },
    };
    expect(readApiError(err, 'net', 'gen')).toEqual({
      code: 'CONFLICT',
      message: 'In use',
      fields: { email: 'Taken' },
    });
    expect(readApiError({}, 'net', 'gen')).toEqual({ code: 'NETWORK', message: 'net', fields: {} });
    expect(readApiError({ response: { data: {} } }, 'net', 'gen')).toMatchObject({
      code: 'INTERNAL',
      message: 'gen',
    });
  });
});

describe('session hint storage failures', () => {
  test('never throws when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(hasSessionHint()).toBe(true);
    spy.mockRestore();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setSessionHint(true)).not.toThrow();
    set.mockRestore();
  });
});
