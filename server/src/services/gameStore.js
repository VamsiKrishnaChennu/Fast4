import { CATEGORIES } from '@fastfour/shared';
import { Challenge } from '../models/Challenge.js';
import { Game } from '../models/Game.js';
import { Round } from '../models/Round.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';

/**
 * Saves group games to MongoDB: the game when it starts, each round when it is judged, and the
 * result and every player's stats when it ends. The game engine keeps running from memory; it only
 * writes here and never waits for a read.
 * @param {{ clock?: { now: () => number } }} [deps]
 */
export function createGameStore({ clock = { now: () => Date.now() } } = {}) {
  return {
    /** @returns {Promise<string>} the new game id */
    async createGame({ players, rounds, startedAt }) {
      const game = await Game.create({
        mode: 'group',
        players: players.map((p) => ({ userId: p.userId, nickname: p.nickname })),
        settings: { rounds },
        startedAt: new Date(startedAt ?? clock.now()),
      });
      return String(game._id);
    },

    /** @returns {Promise<string>} the new round id */
    async createRound({ gameId, index, letter, startedAt, endsAt }) {
      const round = await Round.create({
        gameId,
        index,
        letter,
        startedAt: new Date(startedAt),
        endsAt: new Date(endsAt),
      });
      return String(round._id);
    },

    /** Stores everyone's judged answers and closes the round's writing window. */
    async saveRound({ roundId, gameId, bonusWinnerId, rows }) {
      await Submission.insertMany(
        rows.map((r) => ({
          roundId,
          gameId,
          userId: r.userId,
          answers: Object.fromEntries(
            CATEGORIES.map((c) => {
              const a = r.answers[c];
              return [
                c,
                {
                  raw: a.raw,
                  normalized: a.normalized,
                  verdict: a.verdict,
                  verdictSource: a.source ?? undefined,
                  reason: a.reason ?? undefined,
                  matchKey: a.matchKey,
                  count: a.count,
                  points: a.points,
                },
              ];
            }),
          ),
          finishedAt: r.finishedAt,
          finishOrder: r.finishOrder,
          firstFinisherBonus: r.firstFinisherBonus,
          roundScore: r.roundScore,
        })),
      );
      await Round.updateOne({ _id: roundId }, { $set: { bonusWinnerId, status: 'review' } });
    },

    /** Writes verdicts, points and the bonus winner again after a challenge changed them. */
    async updateRound({ roundId, bonusWinnerId, rows }) {
      for (const r of rows) {
        await Submission.updateOne(
          { roundId, userId: r.userId },
          {
            $set: {
              answers: Object.fromEntries(
                CATEGORIES.map((c) => {
                  const a = r.answers[c];
                  return [
                    c,
                    {
                      raw: a.raw,
                      normalized: a.normalized,
                      verdict: a.verdict,
                      verdictSource: a.source ?? undefined,
                      reason: a.reason ?? undefined,
                      matchKey: a.matchKey,
                      count: a.count,
                      points: a.points,
                    },
                  ];
                }),
              ),
              firstFinisherBonus: r.firstFinisherBonus,
              roundScore: r.roundScore,
            },
          },
        );
      }
      await Round.updateOne({ _id: roundId }, { $set: { bonusWinnerId } });
    },

    /** Saves one finished challenge or appeal. A duplicate is ignored (each answer is checked once). */
    async saveChallenge(data) {
      try {
        await Challenge.create(data);
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    },

    /** Writes the final result once and, when the game was played, updates every player's stats. */
    async finishGame({ gameId, letters, players, winnerIds, status, endedAt, updateStats }) {
      const claimed = await Game.updateOne(
        { _id: gameId, status: 'in_progress' },
        {
          $set: {
            status,
            letters,
            endedAt: new Date(endedAt ?? clock.now()),
            winnerIds,
            players: players.map((p) => ({
              userId: p.userId,
              nickname: p.nickname,
              totalScore: p.totalScore,
              uniqueAnswers: p.uniqueAnswers,
              firstFinisherCount: p.firstFinisherCount,
              failedChallenges: p.failedChallenges,
              rank: p.rank,
            })),
          },
        },
      );
      await Round.updateMany({ gameId }, { $set: { status: 'complete' } });
      if (!updateStats || claimed.modifiedCount !== 1) return;
      await Promise.all(
        players.map((p) =>
          User.updateOne(
            { _id: p.userId },
            {
              $inc: {
                'stats.gamesPlayed': 1,
                'stats.groupGamesPlayed': 1,
                'stats.groupWins': winnerIds.includes(p.userId) ? 1 : 0,
                'stats.groupTotalScore': p.totalScore,
                'stats.uniqueAnswers': p.uniqueAnswers,
              },
            },
          ),
        ),
      );
    },
  };
}
