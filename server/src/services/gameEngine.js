import { CATEGORIES, LIMITS, PHASES, matchKey } from '@fastfour/shared';
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
 * @param {{ check: Function } | null} [deps.judge] the outside word check used by challenges and appeals
 * @param {{ add: Function, markOverturned: Function } | null} [deps.dictionary] receives words that won an appeal
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
  judge: judgeService = null,
  dictionary = null,
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
  /** Challenges and appeals used per player this game (a check that failed to run is not counted). */
  const challengeUse = new Map(participants.map((id) => [id, 0]));

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
      challenges: new Map(),
      applied: new Map(),
      dirty: false,
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
    applyRound();
    const bonusWinnerId = rows.find((r) => r.firstFinisherBonus > 0)?.userId ?? null;
    round.bonusWinnerId = bonusWinnerId;
    judgedRounds += 1;
    round.savedPromise = round.roundIdPromise.then(async (roundId) => {
      const gameId = await gameIdPromise;
      if (!roundId || !gameId) return;
      await safe(() => store.saveRound({ roundId, gameId, bonusWinnerId, rows: storedRows() }));
    });
    const reviewEndsAt = clock.now() + t.reviewMs;
    review = {
      index,
      letter,
      bonusWinnerId,
      reviewEndsAt,
      closing: false,
      submissions: rows.map(publicRow),
    };
    setPhase(PHASES.REVIEW);
    emit.room('round:review', review);
    arm(t.reviewMs, reviewTimeUp);
  }

  const storedRows = () =>
    round.rows.map((r) => ({
      ...r,
      finishedAt: r.finishedAt === null ? null : new Date(r.finishedAt),
    }));

  /**
   * Makes the players' totals match the round's current rows. Recomputed, never patched: the
   * contribution this round made last time is taken off first.
   */
  function applyRound() {
    for (const row of round.rows) {
      const total = totals.get(row.userId);
      const before = round.applied.get(row.userId) ?? { score: 0, unique: 0, bonus: 0 };
      total.totalScore += row.roundScore - before.score;
      total.uniqueAnswers += row.uniqueAnswers - before.unique;
      total.firstFinisherCount += (row.firstFinisherBonus > 0 ? 1 : 0) - before.bonus;
      round.applied.set(row.userId, {
        score: row.roundScore,
        unique: row.uniqueAnswers,
        bonus: row.firstFinisherBonus > 0 ? 1 : 0,
      });
    }
    syncScores();
  }

  /** Scores the round again from the current verdicts, including the first-finisher bonus. */
  function rescore() {
    const scored = scoreRound(
      round.rows.map((r) => ({
        userId: r.userId,
        finishedAt: r.finishedAt,
        finishOrder: r.finishOrder,
        answers: Object.fromEntries(
          CATEGORIES.map((c) => [
            c,
            { verdict: r.answers[c].verdict, matchKey: r.answers[c].matchKey },
          ]),
        ),
      })),
    );
    round.rows.forEach((r, i) => {
      for (const c of CATEGORIES) {
        r.answers[c].count = scored[i].answers[c].count;
        r.answers[c].points = scored[i].answers[c].points;
      }
      r.firstFinisherBonus = scored[i].firstFinisherBonus;
      r.uniqueAnswers = scored[i].uniqueAnswers;
      r.roundScore = scored[i].roundScore;
    });
    round.bonusWinnerId = round.rows.find((r) => r.firstFinisherBonus > 0)?.userId ?? null;
    applyRound();
    review = {
      ...review,
      bonusWinnerId: round.bonusWinnerId,
      submissions: round.rows.map(publicRow),
    };
  }

  /** Writes changed verdicts and scores to the database once the round's first save is done. */
  async function flushRound() {
    if (!round?.dirty || !store.updateRound) return;
    round.dirty = false;
    const r = round;
    await safe(async () => {
      await r.savedPromise;
      const roundId = await r.roundIdPromise;
      if (!roundId) return;
      await store.updateRound({
        roundId,
        bonusWinnerId: r.bonusWinnerId,
        rows: r.rows.map((row) => ({ ...row })),
      });
    });
  }

  /** The review time is up: wait for any check that is still running, then move on. */
  function reviewTimeUp() {
    if (room.phase !== PHASES.REVIEW) return undefined;
    if (pendingCount() > 0) {
      review = { ...review, closing: true };
      onChange();
      return undefined;
    }
    return endReview();
  }
  const pendingCount = () =>
    round ? [...round.challenges.values()].filter((c) => c.status === 'pending').length : 0;

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
    flushRound();
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
    await flushRound();
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
    if (pendingCount() > 0)
      throw new AppError('INVALID_PHASE', 'A word check is still running. Wait a moment.');
    if (timer) clock.clearTimeout(timer);
    timer = null;
    endReview();
  }

  // ----- challenges and appeals -----------------------------------------------------------------

  const challengesLeft = (userId) => LIMITS.CHALLENGES_PER_PLAYER - (challengeUse.get(userId) ?? 0);

  /**
   * A player disputes an answer. The server decides whether it is a challenge (someone else's valid
   * answer) or an appeal (their own answer rejected only for missing from the dictionary), checks
   * the rules, then runs one outside word check in the background. There is no voting.
   * @returns {{ challengeId: string, type: 'challenge'|'appeal', done: Promise<void> }} `done` settles when the check is resolved
   * @throws {AppError} INVALID_PHASE, ROUND_EXPIRED, CHALLENGE_DUPLICATE, CHALLENGE_NOT_ALLOWED or CHALLENGE_LIMIT
   */
  function challenge(userId, { roundIndex, targetUserId, category }) {
    if (!round?.entries.has(userId))
      throw new AppError('INVALID_PHASE', 'You are not in this game.');
    if (room.phase !== PHASES.REVIEW || review?.closing || roundIndex !== round.index) {
      throw new AppError('INVALID_PHASE', 'Challenges are only open during the review.');
    }
    const row = round.rows.find((r) => r.userId === targetUserId);
    if (!row || !CATEGORIES.includes(category)) {
      throw new AppError('CHALLENGE_NOT_ALLOWED', 'That answer cannot be checked.');
    }
    const key = `${targetUserId}:${category}`;
    if (round.challenges.has(key)) {
      throw new AppError('CHALLENGE_DUPLICATE', 'That answer has already been checked.');
    }
    const answer = row.answers[category];
    const own = userId === targetUserId;
    const type = own ? 'appeal' : 'challenge';
    const allowed = own
      ? answer.verdict === 'invalid' && answer.reason === 'not_in_dictionary'
      : answer.verdict === 'valid';
    if (!allowed) throw new AppError('CHALLENGE_NOT_ALLOWED', 'That answer cannot be checked.');
    if (challengesLeft(userId) <= 0) {
      throw new AppError('CHALLENGE_LIMIT', 'You have used all your challenges this game.');
    }

    const record = {
      id: `${round.index}-${targetUserId}-${category}`,
      targetUserId,
      initiatorId: userId,
      category,
      type,
      word: answer.normalized,
      wasDictionary: answer.source === 'dictionary',
      status: 'pending',
    };
    round.challenges.set(key, record);
    challengeUse.set(userId, (challengeUse.get(userId) ?? 0) + 1);
    emit.room('challenge:pending', {
      challengeId: record.id,
      roundIndex: round.index,
      targetUserId,
      initiatorId: userId,
      category,
      type,
    });
    onChange();
    return { challengeId: record.id, type, done: resolveChallenge(round, key, record) };
  }

  /** Waits for the word check (with a timeout), then applies the result. */
  async function resolveChallenge(forRound, key, record) {
    let outcome = null;
    let source = 'none';
    let failed = false;
    try {
      if (!judgeService) throw new Error('no judge');
      const result = await withTimeout(judgeService.check(record.category, record.word));
      source = result.source;
      if (result.result === 'inconclusive') outcome = 'inconclusive';
      else if (record.type === 'challenge') {
        outcome = result.result === 'invalid' ? 'overturned' : 'upheld';
      } else {
        outcome = result.result === 'valid' ? 'overturned' : 'upheld';
      }
    } catch (err) {
      failed = true;
      logger?.info({ err, code: room.code }, 'word check could not run');
    }
    if (disposed || round !== forRound) return;

    if (failed) {
      // Not counted, not used up: the player may try again while the review is open.
      forRound.challenges.delete(key);
      challengeUse.set(
        record.initiatorId,
        Math.max(0, (challengeUse.get(record.initiatorId) ?? 1) - 1),
      );
      emit.room('challenge:resolved', {
        challengeId: record.id,
        roundIndex: forRound.index,
        targetUserId: record.targetUserId,
        initiatorId: record.initiatorId,
        category: record.category,
        type: record.type,
        outcome: 'error',
        challengesLeft: challengesLeft(record.initiatorId),
      });
      onChange();
      finishPending();
      return;
    }

    record.status = 'resolved';
    record.outcome = outcome;
    const countsAsFailed = outcome === 'upheld' || outcome === 'inconclusive';
    if (countsAsFailed) totals.get(record.initiatorId).failedChallenges += 1;
    const row = forRound.rows.find((r) => r.userId === record.targetUserId);
    const answer = row.answers[record.category];
    if (outcome === 'overturned') {
      if (record.type === 'challenge') {
        answer.verdict = 'invalid';
        answer.source = 'challenge_invalid';
        answer.reason = 'challenged';
        answer.matchKey = undefined;
      } else {
        answer.verdict = 'valid';
        answer.source = 'challenge_valid';
        answer.reason = null;
        answer.matchKey = matchKey(answer.normalized, record.category);
      }
      forRound.dirty = true;
      rescore();
    }
    // Side effects on the word lists never block or fail the game.
    if (outcome === 'overturned' && record.type === 'appeal') {
      safe(() => dictionary?.add(record.category, record.word));
    } else if (outcome === 'overturned' && record.wasDictionary) {
      safe(() => dictionary?.markOverturned(record.category, record.word));
    }
    forRound.roundIdPromise.then(async (roundId) => {
      const gameId = await gameIdPromise;
      if (!roundId || !gameId || !store.saveChallenge) return;
      await safe(() =>
        store.saveChallenge({
          gameId,
          roundId,
          targetUserId: record.targetUserId,
          initiatorId: record.initiatorId,
          category: record.category,
          word: record.word,
          type: record.type,
          outcome,
          source,
          countsAsFailed,
          resolvedAt: new Date(clock.now()),
        }),
      );
    });
    emit.room('challenge:resolved', {
      challengeId: record.id,
      roundIndex: forRound.index,
      targetUserId: record.targetUserId,
      initiatorId: record.initiatorId,
      category: record.category,
      type: record.type,
      outcome,
      source,
      countsAsFailed,
      bonusWinnerId: forRound.bonusWinnerId,
      submission: publicRow(row),
      submissions: forRound.rows.map(publicRow),
      standings: standings(),
      challengesLeft: challengesLeft(record.initiatorId),
    });
    onChange();
    finishPending();
  }

  /** After a check ends: if the review time already ran out and nothing else is pending, move on. */
  function finishPending() {
    if (room.phase === PHASES.REVIEW && review?.closing && pendingCount() === 0) endReview();
  }

  /** Rejects after JUDGE_TIMEOUT_MS on the game clock so a stuck check cannot hold the review open. */
  function withTimeout(promise) {
    return new Promise((resolve, reject) => {
      const handle = clock.setTimeout(
        () => reject(new Error('word check timed out')),
        LIMITS.JUDGE_TIMEOUT_MS + 1000,
      );
      Promise.resolve(promise).then(
        (value) => {
          clock.clearTimeout(handle);
          resolve(value);
        },
        (err) => {
          clock.clearTimeout(handle);
          reject(err);
        },
      );
    });
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
    if (phase === PHASES.REVIEW && review) {
      out.review = review;
      out.openChallenges = [...round.challenges.values()]
        .filter((c) => c.status === 'pending')
        .map((c) => ({
          challengeId: c.id,
          roundIndex: round.index,
          targetUserId: c.targetUserId,
          initiatorId: c.initiatorId,
          category: c.category,
          type: c.type,
        }));
      out.checked = [...round.challenges.values()]
        .filter((c) => c.status === 'resolved')
        .map((c) => ({
          targetUserId: c.targetUserId,
          category: c.category,
          type: c.type,
          outcome: c.outcome,
        }));
    }
    if (userId && challengeUse.has(userId)) out.challengesLeft = challengesLeft(userId);
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

  return { start, draft, submit, skipReview, challenge, playersChanged, state, dispose, standings };
}
