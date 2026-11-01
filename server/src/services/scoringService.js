import { CATEGORIES, LIMITS, SCORING } from '@fastfour/shared';

/**
 * Scoring and ranking. Pure functions: no database, no clock, no input is modified.
 * Everything is recomputed from final verdicts, never patched step by step.
 */

const toMillis = (value) => (value instanceof Date ? value.getTime() : value);
const isValid = (answer) => answer?.verdict === 'valid';

/**
 * Picks the first-finisher bonus winner: the earliest finisher whose four answers are all valid.
 * Ties on finishedAt go to the lower finishOrder (the order the server received the events).
 * @param {Array<{userId: *, finishedAt?: (number|Date|null), finishOrder?: (number|null), answers: object}>} submissions
 * @returns {*} the winner's userId, or null when nobody qualifies
 */
export function findBonusWinner(submissions) {
  const finishers = submissions
    .filter((s) => s.finishedAt !== null && s.finishedAt !== undefined)
    .map((s, index) => ({ s, index }))
    .sort(
      (a, b) =>
        toMillis(a.s.finishedAt) - toMillis(b.s.finishedAt) ||
        (a.s.finishOrder ?? Infinity) - (b.s.finishOrder ?? Infinity) ||
        a.index - b.index,
    );
  const winner = finishers.find(({ s }) => CATEGORIES.every((c) => isValid(s.answers?.[c])));
  return winner ? winner.s.userId : null;
}

/**
 * Group-mode scoring for one round.
 * Valid answers with the same matchKey share (5 each); a lone valid answer is unique (10);
 * invalid and blank answers score 0 and do not count toward sharing.
 * @param {Array<{userId: *, finishedAt?: (number|Date|null), finishOrder?: (number|null),
 *   answers: Record<string, {verdict: string, matchKey?: string}>}>} submissions
 * @returns {Array<{userId: *, answers: Record<string, {points: number, count: number}>,
 *   uniqueAnswers: number, firstFinisherBonus: number, roundScore: number}>} one entry per
 *   submission, in the same order
 */
export function scoreRound(submissions) {
  const groups = {};
  for (const category of CATEGORIES) {
    const counts = new Map();
    for (const s of submissions) {
      const a = s.answers?.[category];
      if (isValid(a)) counts.set(a.matchKey, (counts.get(a.matchKey) ?? 0) + 1);
    }
    groups[category] = counts;
  }

  const bonusWinner = findBonusWinner(submissions);

  return submissions.map((s) => {
    const answers = {};
    let uniqueAnswers = 0;
    let total = 0;
    for (const category of CATEGORIES) {
      const a = s.answers?.[category];
      if (!isValid(a)) {
        answers[category] = { points: 0, count: 0 };
        continue;
      }
      const count = groups[category].get(a.matchKey);
      const points = count === 1 ? SCORING.UNIQUE : SCORING.SHARED;
      if (count === 1) uniqueAnswers += 1;
      total += points;
      answers[category] = { points, count };
    }
    const firstFinisherBonus =
      bonusWinner !== null && s.userId === bonusWinner ? SCORING.FIRST_FINISHER_BONUS : 0;
    return {
      userId: s.userId,
      answers,
      uniqueAnswers,
      firstFinisherBonus,
      roundScore: total + firstFinisherBonus,
    };
  });
}

/**
 * Single-player scoring for one round.
 * 10 per valid answer; when all four are valid, a time bonus of ceil(remaining / 6), at most 10.
 * @param {{answers: Record<string, {verdict: string}>, secondsUsed: number}} round secondsUsed is
 *   the time between writing starting and Done (the full round when the timer ran out); roundSeconds
 *   defaults to 60 and only differs in tests.
 * @returns {{answerPoints: number, validCount: number, timeBonus: number, roundScore: number}}
 */
export function scoreSingleRound({ answers, secondsUsed, roundSeconds = LIMITS.ROUND_SECONDS }) {
  const validCount = CATEGORIES.filter((c) => isValid(answers?.[c])).length;
  const answerPoints = validCount * SCORING.SINGLE_VALID;
  let timeBonus = 0;
  if (validCount === CATEGORIES.length) {
    const remaining = Math.max(0, roundSeconds - secondsUsed);
    timeBonus = Math.min(
      SCORING.SINGLE_TIME_BONUS_MAX,
      Math.ceil(remaining / (roundSeconds / SCORING.SINGLE_TIME_BONUS_MAX)),
    );
  }
  return { answerPoints, validCount, timeBonus, roundScore: answerPoints + timeBonus };
}

/**
 * Orders group-game players and assigns competition ranks (1, 1, 3).
 * Tie-break order: total score, more unique answers, more first-finisher bonuses, fewer failed
 * challenges. Players still tied share a rank; everyone with rank 1 is a winner.
 * @param {Array<{userId: *, totalScore: number, uniqueAnswers: number, firstFinisherCount: number,
 *   failedChallenges: number}>} players
 * @returns {Array<object>} copies of the players, best first, each with `rank` and `isWinner`
 */
export function rankPlayers(players) {
  const key = (p) => [p.totalScore, p.uniqueAnswers, p.firstFinisherCount, -p.failedChallenges];
  const compare = (a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] !== kb[i]) return kb[i] - ka[i];
    }
    return 0;
  };
  const sorted = players
    .map((p, index) => ({ p, index }))
    .sort((a, b) => compare(a.p, b.p) || a.index - b.index);
  let rank = 0;
  return sorted.map(({ p }, position) => {
    if (position === 0 || compare(sorted[position - 1].p, p) !== 0) rank = position + 1;
    return { ...p, rank, isWinner: rank === 1 };
  });
}

/**
 * Orders single-player scores for a leaderboard: higher total first, then lower total time.
 * @param {{totalScore: number, totalTimeMs: number}} a
 * @param {{totalScore: number, totalTimeMs: number}} b
 * @returns {number} sort comparator result
 */
export function compareSingleScores(a, b) {
  return b.totalScore - a.totalScore || a.totalTimeMs - b.totalTimeMs;
}
