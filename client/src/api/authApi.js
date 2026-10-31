import { api, plainClient, setAccessToken, setSessionHint } from './axiosClient.js';

export async function signup(payload) {
  const { data } = await api.post('/auth/signup', payload);
  setAccessToken(data.accessToken);
  setSessionHint(true);
  return data.user;
}

export async function login(payload) {
  const { data } = await api.post('/auth/login', payload);
  setAccessToken(data.accessToken);
  setSessionHint(true);
  return data.user;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    setAccessToken(null);
    setSessionHint(false);
  }
}

export async function me() {
  const { data } = await api.get('/auth/me');
  return data.user;
}

export const forgot = (email) => plainClient.post('/auth/forgot', { email });
export const reset = (payload) => plainClient.post('/auth/reset', payload);
