import mongoose from 'mongoose';
import { Game } from '../models/Game.js';
import { User } from '../models/User.js';

const PERIOD_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };
/** How many finished games are read per request. One entry per player is kept from them. */
const SCAN_LIMIT = 1000;

/**
 * Single-player leaderboards. Daily and weekly mean "the last 24 hours" and "the last 7 days".
 * @param {{ clock?: { now: () => number } }} [deps]
 */
export function createLeaderboardService({ clock = { now: () => Date.now() } } = {}) {
  /**
   * Best finished game per player for one rounds setting, best first (score, then lower time).
   * @returns {Promise<Array<{ gameId: string, userId: string, nickname: string, totalScore: number, totalTimeMs: number, endedAt: Date }>>}
   */
  async function bestPerPlayer({ period, rounds }) {
    const filter = { mode: 'single', status: 'finished', 'settings.rounds': rounds };
    if (PERIOD_MS[period]) {
      filter.endedAt = mongoose.trusted({ $gte: new Date(clock.now() - PERIOD_MS[period]) });
    }
    const games = await Game.find(filter)
      .sort({ totalScore: -1, totalTimeMs: 1, endedAt: 1 })
      .limit(SCAN_LIMIT)
      .select('players totalScore totalTimeMs endedAt')
      .lean();
    const seen = new Set();
    const entries = [];
    for (const game of games) {
      const player = game.players[0];
      const userId = String(player.userId);
      if (seen.has(userId)) continue;
      seen.add(userId);
      entries.push({
        gameId: String(game._id),
        userId,
        nickname: player.nickname,
        totalScore: game.totalScore,
        totalTimeMs: game.totalTimeMs,
        endedAt: game.endedAt,
      });
    }
    return entries;
  }

  /**
   * @param {{ period: 'daily'|'weekly'|'all', rounds: number, limit: number, userId: string }} query
   * @returns {Promise<{ entries: object[], you: (object|null) }>} `you` is the caller's own entry
   *   with its rank, or null when they have no finished game in the list
   */
  async function list({ period, rounds, limit, userId }) {
    const all = await bestPerPlayer({ period, rounds });
    const ranked = all.map((entry, i) => ({
      ...entry,
      rank: i + 1,
      isYou: entry.userId === userId,
    }));
    const shown = ranked.slice(0, limit);
    const youEntry = ranked.find((e) => e.isYou) ?? null;
    const needed = new Set(shown.map((e) => e.userId));
    if (youEntry) needed.add(youEntry.userId);
    const users = await User.find({ _id: mongoose.trusted({ $in: [...needed] }) })
      .select('avatarColor')
      .lean();
    const colors = new Map(users.map((u) => [String(u._id), u.avatarColor]));
    const decorate = (e) => ({ ...e, avatarColor: colors.get(e.userId) ?? null });
    return { entries: shown.map(decorate), you: youEntry ? decorate(youEntry) : null };
  }

  /**
   * Where a player's best game stands for a period, for the "#14 today" figure.
   * @returns {Promise<number|null>} 1-based rank, or null when the player is not on the list
   */
  async function rankOf({ userId, period, rounds }) {
    const all = await bestPerPlayer({ period, rounds });
    const index = all.findIndex((e) => e.userId === String(userId));
    return index === -1 ? null : index + 1;
  }

  return { list, rankOf };
}
