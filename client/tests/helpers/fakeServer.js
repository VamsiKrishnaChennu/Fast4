import { AxiosError } from 'axios';
import { api, plainClient, setAccessToken, setAuthLostHandler } from '../../src/api/axiosClient.js';

/**
 * Replaces the HTTP layer with an in-memory server.
 * Routes are keyed like "POST /auth/login" and return { status, data } (or a promise of it).
 * @returns {{ calls: Array<{ key: string, body: unknown }>, routes: Record<string, Function> }}
 */
export function installFakeServer(routes = {}) {
  const server = { calls: [], routes };
  const adapter = async (config) => {
    const key = `${config.method.toUpperCase()} ${config.url}`;
    let body;
    try {
      body = config.data ? JSON.parse(config.data) : undefined;
    } catch {
      body = config.data;
    }
    server.calls.push({ key, body, auth: config.headers?.Authorization });
    const handler = server.routes[key];
    if (!handler) throw new Error(`No fake route for ${key}`);
    const { status = 200, data } = await handler(config, body);
    const response = { data, status, statusText: '', headers: {}, config };
    if (status >= 200 && status < 300) return response;
    throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response);
  };
  api.defaults.adapter = adapter;
  plainClient.defaults.adapter = adapter;
  setAccessToken(null);
  setAuthLostHandler(() => {});
  return server;
}

export const apiError = (status, code, message, details) => ({
  status,
  data: { error: { code, message, ...(details ? { details } : {}) } },
});

export const sampleUser = (over = {}) => ({
  id: 'u1',
  nickname: 'Maya',
  email: 'maya@example.com',
  phone: null,
  avatarColor: '#FFC247',
  role: 'user',
  isVerified: false,
  stats: { bestSingleScore: 412, groupWins: 7, singleGamesPlayed: 10, groupGamesPlayed: 13 },
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
});
