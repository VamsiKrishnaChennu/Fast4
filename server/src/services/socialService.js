import mongoose from 'mongoose';
import { LIMITS } from '@fastfour/shared';
import { AppError } from '../utils/AppError.js';
import { Game } from '../models/Game.js';
import { User } from '../models/User.js';

/** Game history and the global group leaderboard. Reads only. */
export function createSocialService({ gameModel = Game, userModel = User } = {}) {
  return {
    /**
     * A player's finished games, newest first. `cursor` is the endedAt (ms) of the last item seen.
     * @returns {Promise<{ games: object[], nextCursor: (string|null) }>}
     */
    async history(userId, { limit = LIMITS.HISTORY_PAGE, cursor } = {}) {
      const filter = { 'players.userId': userId, status: 'finished' };
      if (cursor !== undefined) {
        const ms = Number(cursor);
        if (!Number.isFinite(ms)) throw new AppError('VALIDATION_ERROR', 'Bad cursor.');
        filter.endedAt = mongoose.trusted({ $lt: new Date(ms) });
      }
      const rows = await gameModel
        .find(filter)
        .sort({ endedAt: -1 })
        .limit(limit + 1)
        .select('mode settings players endedAt newPersonalBest')
        .lean();
      const page = rows.slice(0, limit);
      const games = page.map((g) => {
        const me = g.players.find((p) => String(p.userId) === userId) ?? g.players[0];
        return {
          id: String(g._id),
          mode: g.mode,
          rounds: g.settings?.rounds ?? 0,
          score: me?.totalScore ?? 0,
          rank: g.mode === 'group' ? (me?.rank ?? null) : null,
          players: g.players.length,
          newPersonalBest: Boolean(g.newPersonalBest),
          endedAt: g.endedAt,
        };
      });
      const more = rows.length > limit;
      return {
        games,
        nextCursor: more ? String(new Date(page.at(-1).endedAt).getTime()) : null,
      };
    },

    /**
     * Global group ranking from the players' running stats. Equal results share a rank.
     * @param {{ metric: 'wins'|'points', limit: number, userId: string }} query
     * @returns {Promise<{ entries: object[], you: (object|null) }>} `you` has the caller's rank even outside the list
     */
    async groupLeaderboard({ metric = 'wins', limit = 50, userId }) {
      const [first, second] =
        metric === 'points'
          ? ['stats.groupTotalScore', 'stats.groupWins']
          : ['stats.groupWins', 'stats.groupTotalScore'];
      const base = { 'stats.groupGamesPlayed': mongoose.trusted({ $gt: 0 }), bannedAt: null };
      const users = await userModel
        .find(base)
        .sort({ [first]: -1, [second]: -1, createdAt: 1 })
        .limit(limit)
        .select('nickname avatarColor stats')
        .lean();
      const val = (u, path) => u.stats?.[path.split('.')[1]] ?? 0;
      let rank = 0;
      const toEntry = (u, r) => ({
        rank: r,
        userId: String(u._id),
        nickname: u.nickname,
        avatarColor: u.avatarColor,
        wins: u.stats?.groupWins ?? 0,
        points: u.stats?.groupTotalScore ?? 0,
        games: u.stats?.groupGamesPlayed ?? 0,
        isYou: String(u._id) === userId,
      });
      const entries = users.map((u, i) => {
        const prev = users[i - 1];
        if (!prev || val(prev, first) !== val(u, first) || val(prev, second) !== val(u, second)) {
          rank = i + 1;
        }
        return toEntry(u, rank);
      });
      let you = entries.find((e) => e.isYou) ?? null;
      if (!you) {
        const me = await userModel.findById(userId).select('nickname avatarColor stats').lean();
        if (me && (me.stats?.groupGamesPlayed ?? 0) > 0) {
          const a = val(me, first);
          const b = val(me, second);
          const better = await userModel.countDocuments({
            ...base,
            $or: [
              { [first]: mongoose.trusted({ $gt: a }) },
              { [first]: a, [second]: mongoose.trusted({ $gt: b }) },
            ],
          });
          you = toEntry(me, better + 1);
        }
      }
      return { entries, you };
    },
  };
}
