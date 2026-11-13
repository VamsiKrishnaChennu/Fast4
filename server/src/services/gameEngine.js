import { CATEGORIES, LIMITS, PHASES } from '@fastfour/shared';
import { AppError } from '../utils/AppError.js';
import { rankPlayers, scoreRound } from './scoringService.js';

/** Default timings in milliseconds. Tests and the end-to-end server pass shorter ones. */
export const DEFAULT_TIMING = {
  startingMs: LIMITS.STARTING_SECONDS * 1000,
  revealMs: LIMITS.LETTER_REVEAL_MS,
  roundMs: LIMITS.ROUND_SECONDS * 1000,
  graceMs: LIMITS.SUBMIT_GRACE_MS,
  reviewMs: LIMITS.REVIEW_SECONDS * 1000,
  resultMs: LIMITS.ROUND_RESULT_SECONDS * 1000,
  aloneMs: LIMITS.ALONE_SECONDS * 1000,
};

const emptyAnswers = () => Object.fromEntries(CATEGORIES.map((c) => [c, '']));
const cleanAnswers = (answers) =>
  Object.fromEntries(CATEGORIES.map((c) => [c, String(answers?.[c] ?? '').slice(0, 100)]));

/**
 * The game of one room: letters, the clock, answers, judging, scoring and standings. The server
 * is the only authority; players only send intent. Every time is an absolute server timestamp.
 *
 * @param {object} deps
 * @param {object} deps.room the room manager's room (players map, settings); `phase` and `status` are kept in step
 * @param {{ now: () => number, setTimeout: Function, clearTimeout: Function }} deps.clock
 * @param {{ validateAnswers: Function }} deps.validation
 * @param {(used: string[]) => string} deps.pickLetter
 * @param {object} deps.store saves games, rounds and stats (see gameStore.js)
 * @param {{ room: Function, socket: Function }} deps.emit sends events (to the room, to one socket)
 * @param {() => void} deps.onChange called after every phase change so the room state is resent
 * @param {object} [deps.timing] overrides for DEFAULT_TIMING
 * @param {import('pino').Logger} [deps.logger]
 */
export function createGameEngine({
  room,
  clock,
  validation,
  pickLetter,
  store,
  emit,
  onChange,
  timing = {},
  logger,
}) {
  const t = { ...DEFAULT_TIMING, ...timing };
  const totalRounds = room.settings.rounds;
  const participants = [...room.players.values()].map((p) => p.userId);
  /** @type {Map<string, object>} */
  const totals = new Map(
    [...room.players.values()].map((p) => [
      p.userId,
      {
        userId: p.userId,
        totalScore: 0,
        uniqueAnswers: 0,
        firstFinisherCount: 0,
        failedChallenges: 0,
      },
    ]),
  );
  const letters = [];
  let timer = null;
  let aloneTimer = null;
  let gameIdPromise = null;
  let round = null;
  let review = null;
  let results = null;
  let gameOver = null;
  let disposed = false;
  let previousRanks = new Map();
  let judgedRounds = 0;

  const setPhase = (phase) => {
    room.phase = phase;
    onChange();
  };
  const arm = (ms, fn) => {
    if (timer) clock.clearTimeout(timer);
    timer = clock.setTimeout(() => {
      timer = null;
      if (!disposed)
        Promise.resolve(fn()).catch((err) => logger?.error({ err }, 'game step failed'));
    }, ms);
  };
  const safe = async (fn, fallback) => {
    try {
      return await fn();
    } catch (err) {
      logger?.warn({ err, code: room.code }, 'could not save game data');
      return fallback;
    }
  };
  const player = (userId) => room.players.get(userId);

  /** Who is in the standings, best first, with their names. */
  function standings() {
    const ranked = rankPlayers([...totals.values()]);
    return ranked.map((p) => ({
      userId: p.userId,
      nickname: player(p.userId)?.nickname ?? '',
      avatarColor: player(p.userId)?.avatarColor,
      left: Boolean(player(p.userId)?.left),
      totalScore: p.totalScore,
      uniqueAnswers: p.uniqueAnswers,
      firstFinisherCount: p.firstFinisherCount,
      failedChallenges: p.failedChallenges,
      rank: p.rank,
    }));
  }

  const syncScores = () => {
    for (const p of totals.values()) {
      const seat = player(p.userId);
      if (seat) seat.score = p.totalScore;
    }
  };

  const activeIds = () => participants.filter((id) => player(id) && !player(id).left);
  const connectedIds = () => activeIds().filter((id) => player(id).connected);

  // ----- phases ---------------------------------------------------------------------------------

  function start() {
    room.status = 'in_progress';
    gameIdPromise = safe(
      () =>
        store.createGame({
          players: participants.map((id) => ({ userId: id, nickname: player(id).nickname })),
          rounds: totalRounds,
          startedAt: clock.now(),
        }),
      null,
    );
    setPhase(PHASES.STARTING);
    arm(t.startingMs, beginToss);
    watchAlone();
  }

  function beginToss() {
    if (letters.length >= totalRounds) return finishGame('completed');
    const index = letters.length;
    const letter = pickLetter(letters);
    letters.push(letter);
    const entries = new Map(
      participants.map((id) => [
        id,
        { draft: emptyAnswers(), answers: null, finishedAt: null, finishOrder: null },
      ]),
    );
    round = {
      index,
      letter,
      entries,
      finishCount: 0,
      startsAt: clock.now(),
      endsAt: null,
      roundId: null,
    };
    review = null;
    results = null;
    previousRanks = new Map(standings().map((s) => [s.userId, s.rank]));
    setPhase(PHASES.LETTER_TOSS);
    emit.room('round:toss', {
      index,
      startsAt: round.startsAt,
      revealAt: round.startsAt + t.revealMs,
    });
    arm(t.revealMs, beginWriting);
    return undefined;
  }

  function beginWriting() {
    const startedAt = clock.now();
    round.writingStartedAt = startedAt;
    round.endsAt = startedAt + t.roundMs;
    const { index, letter, endsAt } = round;
    round.roundIdPromise = safe(async () => {
      const gameId = await gameIdPromise;
      return gameId ? store.createRound({ gameId, index, letter, startedAt, endsAt }) : null;
    }, null);
    setPhase(PHASES.WRITING);
    emit.room('round:started', { index, letter, endsAt, serverNow: clock.now() });
    arm(t.roundMs, collect);
    checkAllDone();
  }

  function collect() {
    if (room.phase !== PHASES.WRITING) return undefined;
    setPhase(PHASES.COLLECTING);
    arm(t.graceMs, judge);
    return undefined;
  }

  function checkAllDone() {
    if (room.phase !== PHASES.WRITING) return;
    const connected = connectedIds();
    if (
      connected.length > 0 &&
      connected.every((id) => round.entries.get(id).finishOrder !== null)
    ) {
      judge();
    }
  }

  /** Judges every player's answers, scores the round and opens the review. */
  async function judge() {
    if (room.phase !== PHASES.WRITING && room.phase !== PHASES.COLLECTING) return;
    if (timer) clock.clearTimeout(timer);
    timer = null;
    setPhase(PHASES.JUDGING);
    const { letter, index } = round;
    const submissions = participants.map((userId) => {
      const entry = round.entries.get(userId);
      const typed = entry.answers ?? entry.draft;
      return {
        userId,
        finishedAt: entry.finishedAt,
        finishOrder: entry.finishOrder,
        answers: validation.validateAnswers(typed, letter),
      };
    });
    const scored = scoreRound(submissions);
    const rows = submissions.map((s, i) => {
      const result = scored[i];
      const answers = Object.fromEntries(
        CATEGORIES.map((c) => [
          c,
          {
            raw: String(s.answers[c].raw ?? '').trim(),
            normalized: s.answers[c].normalized,
            verdict: s.answers[c].verdict,
            source: s.answers[c].verdictSource ?? null,
            reason: s.answers[c].reason ?? null,
            matchKey: s.answers[c].matchKey,
            count: result.answers[c].count,
            points: result.answers[c].points,
          },
        ]),
      );
      return {
        userId: s.userId,
        answers,
        finishOrder: s.finishOrder,
        finishedAt: s.finishedAt,
        firstFinisherBonus: result.firstFinisherBonus,
        uniqueAnswers: result.uniqueAnswers,
        roundScore: result.roundScore,
      };
    });
    round.rows = rows;
    for (const row of rows) {
      const total = totals.get(row.userId);
      total.totalScore += row.roundScore;
      total.uniqueAnswers += row.uniqueAnswers;
      if (row.firstFinisherBonus > 0) total.firstFinisherCount += 1;
    }
    syncScores();
    const bonusWinnerId = rows.find((r) => r.firstFinisherBonus > 0)?.userId ?? null;
    round.bonusWinnerId = bonusWinnerId;
    judgedRounds += 1;
    round.roundIdPromise.then(async (roundId) => {
      const gameId = await gameIdPromise;
      if (!roundId || !gameId) return;
      await safe(() =>
        store.saveRound({
          roundId,
          gameId,
          bonusWinnerId,
          rows: rows.map((r) => ({
            ...r,
            finishedAt: r.finishedAt === null ? null : new Date(r.finishedAt),
          })),
        }),
      );
    });
    const reviewEndsAt = clock.now() + t.reviewMs;
    review = {
      index,
      letter,
      bonusWinnerId,
      reviewEndsAt,
      submissions: rows.map(publicRow),
    };
    setPhase(PHASES.REVIEW);
    emit.room('round:review', review);
    arm(t.reviewMs, endReview);
  }

  const publicRow = (r) => ({
    userId: r.userId,
    answers: Object.fromEntries(
      CATEGORIES.map((c) => {
        const a = r.answers[c];
        return [
          c,
          {
            raw: a.raw,
            verdict: a.verdict,
            source: a.source,
            reason: a.reason,
            count: a.count,
            points: a.points,
          },
        ];
      }),
    ),
    finishOrder: r.finishOrder,
    firstFinisherBonus: r.firstFinisherBonus,
    roundScore: r.roundScore,
  });

  function endReview() {
    if (room.phase !== PHASES.REVIEW) return undefined;
    const board = standings();
    const resultsAt = clock.now();
    results = {
      index: round.index,
      isLast: round.index + 1 >= totalRounds,
      shownAt: resultsAt,
      nextAt: resultsAt + t.resultMs,
      breakdown: round.rows.map((r) => ({
        userId: r.userId,
        answerPoints: Object.fromEntries(CATEGORIES.map((c) => [c, r.answers[c].points])),
        firstFinisherBonus: r.firstFinisherBonus,
        roundScore: r.roundScore,
        totalScore: totals.get(r.userId).totalScore,
        previousRank: previousRanks.get(r.userId) ?? null,
        rank: board.find((b) => b.userId === r.userId)?.rank ?? null,
      })),
      standings: board,
    };
    setPhase(PHASES.ROUND_RESULT);
    emit.room('round:results', results);
    arm(t.resultMs, () => (results.isLast ? finishGame('completed') : beginToss()));
    return undefined;
  }

  async function finishGame(reason) {
    if (room.phase === PHASES.GAME_OVER || disposed) return;
    if (timer) clock.clearTimeout(timer);
    timer = null;
    if (aloneTimer) clock.clearTimeout(aloneTimer);
    aloneTimer = null;
    const ranked = standings();
    const winnerIds = ranked.filter((p) => p.rank === 1).map((p) => p.userId);
    gameOver = {
      standings: ranked,
      winnerIds,
      stats: Object.fromEntries(
        ranked.map((p) => [
          p.userId,
          {
            uniqueAnswers: p.uniqueAnswers,
            firstFinisherCount: p.firstFinisherCount,
            failedChallenges: p.failedChallenges,
          },
        ]),
      ),
      reason,
    };
    room.status = 'finished';
    syncScores();
    setPhase(PHASES.GAME_OVER);
    emit.room('game:over', gameOver);
    const played = judgedRounds > 0;
    await safe(async () => {
      const gameId = await gameIdPromise;
      if (!gameId) return;
      await store.finishGame({
        gameId,
        letters: [...letters],
        players: ranked,
        winnerIds: played ? winnerIds : [],
        status: played ? 'finished' : 'abandoned',
        endedAt: clock.now(),
        updateStats: played,
      });
    });
  }

  // ----- player actions -------------------------------------------------------------------------

  /** Keeps the latest typed answers in memory. Anything out of turn is ignored. */
  function draft(userId, roundIndex, answers) {
    const entry = round?.entries.get(userId);
    const open = room.phase === PHASES.WRITING || room.phase === PHASES.COLLECTING;
    if (!entry || !open || roundIndex !== round.index || entry.finishOrder !== null) return;
    entry.draft = cleanAnswers(answers);
  }

  /**
   * The player pressed Done. Safe to repeat: the second call returns the first result.
   * @throws {AppError} INVALID_PHASE, ROUND_EXPIRED or VALIDATION_ERROR
   */
  function submit(userId, roundIndex, answers) {
    const entry = round?.entries.get(userId);
    if (!entry) throw new AppError('INVALID_PHASE', 'You are not in this game.');
    if (roundIndex === round.index && entry.finishOrder !== null) {
      return { finishOrder: entry.finishOrder };
    }
    const open = room.phase === PHASES.WRITING || room.phase === PHASES.COLLECTING;
    if (roundIndex !== round.index || (!open && room.phase !== PHASES.LETTER_TOSS)) {
      throw new AppError('ROUND_EXPIRED', 'That round is over.');
    }
    if (!open) throw new AppError('INVALID_PHASE', 'Writing has not started yet.');
    const typed = cleanAnswers(answers);
    if (CATEGORIES.some((c) => typed[c].trim() === '')) {
      throw new AppError('VALIDATION_ERROR', 'Fill in all four answers first.');
    }
    round.finishCount += 1;
    entry.answers = typed;
    entry.finishedAt = clock.now();
    entry.finishOrder = round.finishCount;
    emit.room('round:playerFinished', { userId, order: entry.finishOrder });
    onChange();
    if (room.phase === PHASES.WRITING) checkAllDone();
    return { finishOrder: entry.finishOrder };
  }

  /** The host moves on from the review early. */
  function skipReview() {
    if (room.phase !== PHASES.REVIEW)
      throw new AppError('INVALID_PHASE', 'There is no review to skip.');
    if (timer) clock.clearTimeout(timer);
    timer = null;
    endReview();
  }

  /** Called when someone connects, disconnects or leaves. */
  function playersChanged() {
    if (disposed) return;
    checkAllDone();
    watchAlone();
  }

  /** With fewer than two players connected the game waits, then ends. */
  function watchAlone() {
    const live = room.phase !== PHASES.LOBBY && room.phase !== PHASES.GAME_OVER;
    const alone = connectedIds().length < LIMITS.PLAYERS_MIN;
    if (live && alone && !aloneTimer) {
      aloneTimer = clock.setTimeout(() => {
        aloneTimer = null;
        if (disposed || connectedIds().length >= LIMITS.PLAYERS_MIN) return;
        finishGame('alone').catch((err) => logger?.error({ err }, 'could not end game'));
      }, t.aloneMs);
    } else if ((!live || !alone) && aloneTimer) {
      clock.clearTimeout(aloneTimer);
      aloneTimer = null;
    }
  }

  /** What a player's screen needs besides the room itself. */
  function state(userId) {
    const phase = room.phase;
    const writing = [PHASES.WRITING, PHASES.COLLECTING].includes(phase);
    const out = { standings: standings(), openChallenges: [], totalRounds, round: null };
    if (round && phase !== PHASES.STARTING) {
      out.round = {
        index: round.index,
        startsAt: round.startsAt,
        revealAt: round.startsAt + t.revealMs,
        roundMs: t.roundMs,
        ...(phase === PHASES.LETTER_TOSS ? {} : { letter: round.letter, endsAt: round.endsAt }),
        finished: [...round.entries]
          .filter(([, e]) => e.finishOrder !== null)
          .map(([id, e]) => ({ userId: id, order: e.finishOrder }))
          .sort((a, b) => a.order - b.order),
      };
    }
    if (phase === PHASES.REVIEW && review) out.review = review;
    if (phase === PHASES.ROUND_RESULT && results) out.results = results;
    if (phase === PHASES.GAME_OVER && gameOver) out.gameOver = gameOver;
    if (userId && round?.entries.has(userId) && writing) {
      const mine = round.entries.get(userId);
      out.myDraft = mine.answers ?? mine.draft;
      out.mySubmitted = mine.finishOrder !== null;
    }
    return out;
  }

  function dispose() {
    disposed = true;
    if (timer) clock.clearTimeout(timer);
    if (aloneTimer) clock.clearTimeout(aloneTimer);
    timer = null;
    aloneTimer = null;
  }

  return { start, draft, submit, skipReview, playersChanged, state, dispose, standings };
}
