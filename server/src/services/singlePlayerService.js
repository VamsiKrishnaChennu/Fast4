import { CATEGORIES, LIMITS, SCORING } from '@fastfour/shared';
import { Game } from '../models/Game.js';
import { Round } from '../models/Round.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { pickLetter } from './letterService.js';
import { scoreSingleRound } from './scoringService.js';

const isDuplicateKey = (err) => err?.code === 11000;

/**
 * Single-player (time attack) games. The server owns the letters, the clock and the scoring; the
 * client only shows what it is told.
 * @param {object} deps
 * @param {{ validateAnswers: Function }} deps.validation
 * @param {{ now: () => number }} [deps.clock] injectable for tests
 * @param {number} [deps.roundSeconds]
 * @param {number} [deps.revealMs] length of the letter toss before writing starts
 * @param {() => number} [deps.random]
 * @param {(used: string[], random: () => number) => string} [deps.pickLetter] tests choose the letters
 * @param {{ rankOf: Function }} [deps.leaderboard] used for the "rank today" figure
 */
export function createSinglePlayerService({
  validation,
  clock = { now: () => Date.now() },
  roundSeconds = LIMITS.ROUND_SECONDS,
  revealMs = LIMITS.LETTER_REVEAL_MS,
  random = Math.random,
  pickLetter: choose = pickLetter,
  leaderboard,
}) {
  const notFound = () => new AppError('NOT_FOUND', 'Game not found.');

  async function ownedGame(userId, gameId) {
    const game = await Game.findById(gameId);
    if (!game || game.mode !== 'single' || String(game.players[0]?.userId) !== String(userId)) {
      throw notFound();
    }
    return game;
  }

  const latestRound = (gameId) => Round.findOne({ gameId }).sort({ index: -1 });

  const roundView = (round) => ({
    index: round.index,
    letter: round.letter,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
    serverNow: clock.now(),
  });

  const submissionView = (sub) => ({
    index: sub.index,
    verdicts: Object.fromEntries(
      CATEGORIES.map((c) => {
        const a = sub.answers[c];
        return [c, { raw: a.raw, verdict: a.verdict, reason: a.reason ?? null, points: a.points }];
      }),
    ),
    points: Object.fromEntries(CATEGORIES.map((c) => [c, sub.answers[c].points])),
    timeBonus: sub.timeBonus,
    roundScore: sub.roundScore,
    secondsUsed: sub.secondsUsed,
    missed: sub.missed,
  });

  async function submissionsOf(gameId) {
    const rounds = await Round.find({ gameId }).sort({ index: 1 }).lean();
    const subs = await Submission.find({ gameId }).lean();
    const byRound = new Map(subs.map((s) => [String(s.roundId), s]));
    return rounds.map((r) => {
      const sub = byRound.get(String(r._id));
      return { round: r, submission: sub ? { ...sub, index: r.index } : null };
    });
  }

  /** Marks the game finished once, adds up the totals and updates the player's stats. */
  async function finishGame(game) {
    const all = await submissionsOf(game._id);
    const subs = all.map((x) => x.submission).filter(Boolean);
    const totalScore = subs.reduce((sum, s) => sum + s.roundScore, 0);
    const totalTimeMs = Math.round(
      subs.reduce((sum, s) => sum + (s.secondsUsed ?? roundSeconds) * 1000, 0),
    );
    const userId = game.players[0].userId;
    const user = await User.findById(userId).select('stats').lean();
    const previousBest = Number(user?.stats?.bestByRounds?.[String(game.settings.rounds)] ?? 0);
    const newPersonalBest = totalScore > previousBest;

    const claimed = await Game.updateOne(
      { _id: game._id, status: 'in_progress' },
      {
        $set: {
          status: 'finished',
          endedAt: new Date(clock.now()),
          totalScore,
          totalTimeMs,
          newPersonalBest,
          'players.0.totalScore': totalScore,
          'players.0.rank': 1,
        },
      },
    );
    if (claimed.modifiedCount !== 1) return; // another request already finished it
    await User.updateOne(
      { _id: userId },
      {
        $inc: { 'stats.gamesPlayed': 1, 'stats.singleGamesPlayed': 1 },
        $max: {
          'stats.bestSingleScore': totalScore,
          [`stats.bestByRounds.${game.settings.rounds}`]: totalScore,
        },
      },
    );
  }

  /**
   * Judges and stores one round. Safe to call twice: the second call returns the stored result.
   * @returns {Promise<object>} the round result
   */
  async function recordRound(game, round, rawAnswers, { secondsUsed, missed = false }) {
    const verdicts = validation.validateAnswers(rawAnswers, round.letter);
    const score = scoreSingleRound({ answers: verdicts, secondsUsed, roundSeconds });
    const answers = Object.fromEntries(
      CATEGORIES.map((c) => {
        const v = verdicts[c];
        const valid = v.verdict === 'valid';
        const answer = {
          raw: typeof v.raw === 'string' ? v.raw : '',
          normalized: v.normalized,
          verdict: v.verdict,
          count: valid ? 1 : 0,
          points: valid ? SCORING.SINGLE_VALID : 0,
        };
        if (v.verdictSource) answer.verdictSource = v.verdictSource;
        if (v.reason) answer.reason = v.reason;
        if (v.matchKey) answer.matchKey = v.matchKey;
        return [c, answer];
      }),
    );
    let sub;
    try {
      sub = await Submission.create({
        roundId: round._id,
        gameId: game._id,
        userId: game.players[0].userId,
        answers,
        finishedAt: missed ? null : new Date(clock.now()),
        timeBonus: score.timeBonus,
        roundScore: score.roundScore,
        secondsUsed,
        missed,
      });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      sub = await Submission.findOne({ roundId: round._id });
    }
    await Round.updateOne({ _id: round._id }, { $set: { status: 'complete' } });

    const isLast = round.index === game.settings.rounds - 1;
    if (isLast) await finishGame(game);
    const all = await submissionsOf(game._id);
    const totalScore = all.reduce((sum, x) => sum + (x.submission?.roundScore ?? 0), 0);
    if (!isLast) {
      await Game.updateOne(
        { _id: game._id },
        { $set: { totalScore, 'players.0.totalScore': totalScore } },
      );
    }
    return { ...submissionView({ ...sub.toObject(), index: round.index }), totalScore, isLast };
  }

  const blankAnswers = () => Object.fromEntries(CATEGORIES.map((c) => [c, '']));

  /** If the open round ran past its deadline plus grace, scores it as missed (zero). */
  async function settleExpired(game) {
    if (game.status !== 'in_progress') return;
    const round = await latestRound(game._id);
    if (!round || round.status !== 'writing') return;
    if (clock.now() <= round.endsAt.getTime() + LIMITS.SUBMIT_GRACE_MS) return;
    await recordRound(game, round, blankAnswers(), { secondsUsed: roundSeconds, missed: true });
  }

  /**
   * Starts a game. Any game this player left open is abandoned first.
   * @returns {Promise<{ gameId: string, rounds: number, roundSeconds: number }>}
   */
  async function createGame(userId, rounds) {
    const user = await User.findById(userId).select('nickname').lean();
    if (!user) throw new AppError('UNAUTHENTICATED', 'Please log in.');
    await Game.updateMany(
      { mode: 'single', status: 'in_progress', 'players.userId': userId },
      { $set: { status: 'abandoned', endedAt: new Date(clock.now()) } },
    );
    const game = await Game.create({
      mode: 'single',
      players: [{ userId, nickname: user.nickname }],
      settings: { rounds },
      startedAt: new Date(clock.now()),
    });
    return { gameId: String(game._id), rounds, roundSeconds };
  }

  /**
   * Starts the next round, or returns the open one (so a reload or a repeated call is harmless).
   * Writing starts after the letter toss: startedAt is the end of the toss, not "now".
   */
  async function nextRound(userId, gameId) {
    const game = await ownedGame(userId, gameId);
    if (game.status !== 'in_progress') {
      throw new AppError('INVALID_PHASE', 'This game is over.');
    }
    await settleExpired(game);
    const fresh = await Game.findById(game._id);
    if (fresh.status !== 'in_progress') throw new AppError('INVALID_PHASE', 'This game is over.');
    const last = await latestRound(game._id);
    if (last && last.status === 'writing') return roundView(last);

    const index = last ? last.index + 1 : 0;
    if (index >= game.settings.rounds) throw new AppError('INVALID_PHASE', 'This game is over.');
    const startedAt = new Date(clock.now() + revealMs);
    const endsAt = new Date(startedAt.getTime() + roundSeconds * 1000);
    try {
      const round = await Round.create({
        gameId: game._id,
        index,
        letter: choose(fresh.letters, random),
        startedAt,
        endsAt,
      });
      await Game.updateOne({ _id: game._id }, { $push: { letters: round.letter } });
      return roundView(round);
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      return roundView(await Round.findOne({ gameId: game._id, index }));
    }
  }

  /**
   * Judges a round. Accepted until endsAt plus the grace period; after that the round is scored
   * as missed and ROUND_EXPIRED is returned.
   */
  async function submit(userId, gameId, index, rawAnswers) {
    const game = await ownedGame(userId, gameId);
    const round = await Round.findOne({ gameId: game._id, index });
    if (!round) throw new AppError('INVALID_PHASE', 'That round has not started.');
    const existing = await Submission.findOne({ roundId: round._id });
    if (existing) {
      const all = await submissionsOf(game._id);
      const totalScore = all.reduce((sum, x) => sum + (x.submission?.roundScore ?? 0), 0);
      return {
        ...submissionView({ ...existing.toObject(), index }),
        totalScore,
        isLast: index === game.settings.rounds - 1,
      };
    }
    if (game.status !== 'in_progress') throw new AppError('INVALID_PHASE', 'This game is over.');
    const now = clock.now();
    if (now > round.endsAt.getTime() + LIMITS.SUBMIT_GRACE_MS) {
      await settleExpired(game);
      throw new AppError('ROUND_EXPIRED', 'Time ran out for this round.');
    }
    const used = (now - round.startedAt.getTime()) / 1000;
    const secondsUsed = Math.min(roundSeconds, Math.max(0, used));
    return recordRound(game, round, rawAnswers, { secondsUsed });
  }

  /** The state a client needs to resume: totals, the open round, and every finished round. */
  async function getGame(userId, gameId) {
    const owned = await ownedGame(userId, gameId);
    await settleExpired(owned);
    const game = await Game.findById(owned._id).lean();
    const all = await submissionsOf(game._id);
    const results = all.filter((x) => x.submission).map((x) => submissionView(x.submission));
    const open = all.find((x) => !x.submission);
    const totalScore = results.reduce((sum, r) => sum + r.roundScore, 0);
    const view = {
      id: String(game._id),
      status: game.status,
      rounds: game.settings.rounds,
      roundSeconds,
      totalScore,
      results,
      round: game.status === 'in_progress' && open ? roundView(open.round) : null,
      serverNow: clock.now(),
    };
    if (game.status === 'finished') {
      const all4 = results.filter((r) =>
        CATEGORIES.every((c) => r.verdicts[c].verdict === 'valid'),
      );
      view.summary = {
        totalScore,
        newPersonalBest: game.newPersonalBest,
        validAnswers: results.reduce(
          (n, r) => n + CATEGORIES.filter((c) => r.verdicts[c].verdict === 'valid').length,
          0,
        ),
        possibleAnswers: game.settings.rounds * CATEGORIES.length,
        fastestRoundSeconds: all4.length
          ? Math.round(Math.min(...all4.map((r) => r.secondsUsed)))
          : null,
        rankToday: leaderboard
          ? await leaderboard.rankOf({ userId, period: 'daily', rounds: game.settings.rounds })
          : null,
      };
    }
    return view;
  }

  /** Leaves the game. The score so far is not counted on leaderboards. */
  async function quit(userId, gameId) {
    const game = await ownedGame(userId, gameId);
    if (game.status === 'in_progress') {
      await Game.updateOne(
        { _id: game._id },
        { $set: { status: 'abandoned', endedAt: new Date(clock.now()) } },
      );
    }
    return { status: game.status === 'in_progress' ? 'abandoned' : game.status };
  }

  return { createGame, nextRound, submit, getGame, quit };
}
