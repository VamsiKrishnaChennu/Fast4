import { api } from './axiosClient.js';

export const createGame = async (rounds) => (await api.post('/single/games', { rounds })).data;
export const nextRound = async (gameId) =>
  (await api.post(`/single/games/${gameId}/rounds/next`)).data;
export const submitRound = async (gameId, index, answers) =>
  (await api.post(`/single/games/${gameId}/rounds/${index}/submit`, { answers })).data;
export const getGame = async (gameId) => (await api.get(`/single/games/${gameId}`)).data;
export const quitGame = async (gameId) => (await api.post(`/single/games/${gameId}/quit`)).data;
export const singleLeaderboard = async ({ period, rounds }) =>
  (await api.get('/leaderboards/single', { params: { period, rounds } })).data;
