import axios from 'axios';

const baseURL = `${import.meta.env.VITE_API_URL ?? ''}/api`;

/** Requests without interceptors; used for the refresh call itself. */
export const plainClient = axios.create({ baseURL, withCredentials: true });
export const api = axios.create({ baseURL, withCredentials: true });

const HINT = 'ff-session';
let accessToken = null;
let refreshing = null;
let authLostHandler = () => {};

/** The access token lives in memory only (never localStorage). */
export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

/**
 * A harmless flag saying this browser signed in before. It stops anonymous visitors from
 * making a refresh request that is bound to fail.
 */
export function setSessionHint(on) {
  try {
    if (on) localStorage.setItem(HINT, '1');
    else localStorage.removeItem(HINT);
  } catch {
    // Storage can be unavailable; the app then simply tries to refresh every time.
  }
}
export function hasSessionHint() {
  try {
    return localStorage.getItem(HINT) === '1';
  } catch {
    return true;
  }
}
export const setAuthLostHandler = (fn) => {
  authLostHandler = fn;
};

/**
 * Gets a new access token with the refresh cookie. Parallel callers share one request,
 * because every refresh rotates the cookie.
 * @returns {Promise<string>}
 */
export function refreshAccessToken() {
  if (!refreshing) {
    refreshing = plainClient
      .post('/auth/refresh')
      .then((res) => {
        setAccessToken(res.data.accessToken);
        setSessionHint(true);
        return res.data.accessToken;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.error?.code;
    if (
      error.response?.status === 401 &&
      code === 'TOKEN_EXPIRED' &&
      original &&
      !original._retried
    ) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (refreshError) {
        setAccessToken(null);
        setSessionHint(false);
        authLostHandler();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Turns any request error into { code, message, fields } for the UI.
 * @param {unknown} err
 * @param {string} networkMessage
 * @param {string} genericMessage
 */
export function readApiError(err, networkMessage, genericMessage) {
  const body = err?.response?.data?.error;
  if (!err?.response) return { code: 'NETWORK', message: networkMessage, fields: {} };
  const fields = {};
  for (const d of body?.details ?? []) if (d.field && !fields[d.field]) fields[d.field] = d.message;
  return { code: body?.code ?? 'INTERNAL', message: body?.message ?? genericMessage, fields };
}
