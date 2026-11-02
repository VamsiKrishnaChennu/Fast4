import { api } from './axiosClient.js';

/** @returns {Promise<{ code: string, status: string, playerCount: number, maxPlayers: number, rounds: number, hostNickname: string, players: Array<{ nickname: string, avatarColor: string }> }>} */
export const getRoomPreview = async (code) => (await api.get(`/rooms/${code}`)).data;
