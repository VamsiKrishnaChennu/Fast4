import { api } from './axiosClient.js';

export async function listBlocks() {
  const { data } = await api.get('/blocks');
  return data.blocks;
}
export async function addBlock(userId) {
  const { data } = await api.post('/blocks', { userId });
  return data.blocks;
}
export const removeBlock = (userId) => api.delete(`/blocks/${userId}`);
export async function sendReport(payload) {
  const { data } = await api.post('/reports', payload);
  return data;
}
export async function gameHistory({ limit = 20, cursor } = {}) {
  const { data } = await api.get('/users/me/games', { params: { limit, cursor } });
  return data;
}
export async function groupLeaderboard({ metric = 'wins', limit = 50 } = {}) {
  const { data } = await api.get('/leaderboards/group', { params: { metric, limit } });
  return data;
}
export async function updateProfile(payload) {
  const { data } = await api.patch('/users/me', payload);
  return data.user;
}
