import { CATEGORIES } from '@fastfour/shared';
import {
  compareSingleScores,
  findBonusWinner,
  rankPlayers,
  scoreRound,
  scoreSingleRound,
} from '../../src/services/scoringService.js';

// Short-hand: 'x' = valid answer with matchKey x, 'X' = invalid, '' = blank.
const answer = (spec) => {
  if (spec === '') return { verdict: 'blank' };
  if (spec === 'X') return { verdict: 'invalid' };
  return { verdict: 'valid', matchKey: spec };
};
const sub = (userId, specs, extra = {}) => ({
  userId,
  answers: Object.fromEntries(
    CATEGORIES.map((c, i) => [c, answer(Array.isArray(specs) ? specs[i] : specs)]),
  ),
  ...extra,
});
/** Name-category scenarios: the other three categories are given unique valid keys per player. */
const nameRound = (specs, extra = {}) =>
  specs.map((spec, i) => ({
    userId: `p${i}`,
    answers: {
      name: answer(spec),
      place: answer(`place${i}`),
      animal: answer(`animal${i}`),
      thing: answer(`thing${i}`),
    },
    ...(extra[i] ?? {}),
  }));
const namePoints = (results) => results.map((r) => r.answers.name.points);

describe('scoreRound: group scoring, Name category', () => {
  test.each([
    ['1 all different', ['alex', 'adam', 'amy'], [10, 10, 10]],
    ['2 one shared pair', ['alex', 'alex', 'amy'], [5, 5, 10]],
    ['3 all three share', ['alex', 'alex', 'alex'], [5, 5, 5]],
    ['4 valid, invalid, blank', ['alex', 'X', ''], [10, 0, 0]],
    ['7 two players share', ['ann', 'ann'], [5, 5]],
    [
      '8 eight players, four pairs',
      ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'],
      [5, 5, 5, 5, 5, 5, 5, 5],
    ],
    ['9 one player only', ['alex'], [10]],
    ['10 invalid text does not count toward sharing', ['alex', 'X'], [10, 0]],
  ])('%s', (_label, specs, expected) => {
    expect(namePoints(scoreRound(nameRound(specs)))).toEqual(expected);
  });

  test('5 plural folding is by matchKey, so cat and cats share (Animal)', () => {
    const subs = [sub('a', ['n1', 'p1', 'cat', 't1']), sub('b', ['n2', 'p2', 'cat', 't2'])];
    const [a, b] = scoreRound(subs);
    expect([a.answers.animal.points, b.answers.animal.points]).toEqual([5, 5]);
    expect(a.answers.animal.count).toBe(2);
  });

  test('6 all blank scores zero without throwing', () => {
    const results = scoreRound([sub('a', ''), sub('b', '')]);
    expect(results.map((r) => r.roundScore)).toEqual([0, 0]);
    expect(results[0].answers.name).toEqual({ points: 0, count: 0 });
  });

  test('no submissions gives no results', () => {
    expect(scoreRound([])).toEqual([]);
  });

  test('a missing answers object counts as blank', () => {
    const [r] = scoreRound([{ userId: 'a' }]);
    expect(r.roundScore).toBe(0);
  });

  test('the same key in different categories does not share', () => {
    const [a, b] = scoreRound([sub('a', ['x', 'y', 'z', 'w']), sub('b', ['q', 'x', 'r', 's'])]);
    expect(a.answers.name.points).toBe(10);
    expect(b.answers.place.points).toBe(10);
  });

  test('counts unique answers per player', () => {
    const [a, b] = scoreRound([
      sub('a', ['n1', 'p1', 'c', 't1']),
      sub('b', ['n2', 'p2', 'c', 'X']),
    ]);
    expect(a.uniqueAnswers).toBe(3);
    expect(b.uniqueAnswers).toBe(2);
  });

  test('does not modify its input', () => {
    const subs = nameRound(['alex', 'alex']);
    const copy = JSON.parse(JSON.stringify(subs));
    scoreRound(subs);
    expect(subs).toEqual(copy);
  });
});

describe('first finisher bonus', () => {
  const t = (n) => 1000 + n;
  const all = 'ok';
  const unique = (id) => [`${id}1`, `${id}2`, `${id}3`, `${id}4`];
  const bonusOf = (subs) =>
    Object.fromEntries(scoreRound(subs).map((r) => [r.userId, r.firstFinisherBonus]));

  test('1 first finisher with four valid gets +5', () => {
    const subs = [
      sub('A', unique('a'), { finishedAt: t(1) }),
      sub('B', unique('b'), { finishedAt: t(2) }),
    ];
    expect(bonusOf(subs)).toEqual({ A: 5, B: 0 });
  });

  test('2 first finisher with an invalid answer loses it to the second', () => {
    const subs = [
      sub('A', ['a1', 'X', 'a3', 'a4'], { finishedAt: t(1) }),
      sub('B', unique('b'), { finishedAt: t(2) }),
    ];
    expect(bonusOf(subs)).toEqual({ A: 0, B: 5 });
  });

  test('3 and 4 and 5 recompute from final verdicts', () => {
    const build = (a, b, c) => [
      sub('A', a, { finishedAt: t(1) }),
      sub('B', b, { finishedAt: t(2) }),
      sub('C', c, { finishedAt: t(3) }),
    ];
    // before the challenge A holds it
    expect(bonusOf(build(unique('a'), unique('b'), unique('c')))).toEqual({ A: 5, B: 0, C: 0 });
    // 3: one of A's answers is overturned, B gets it
    expect(bonusOf(build(['a1', 'X', 'a3', 'a4'], unique('b'), unique('c')))).toEqual({
      A: 0,
      B: 5,
      C: 0,
    });
    // 4: B also has an invalid answer, C gets it
    expect(bonusOf(build(['a1', 'X', 'a3', 'a4'], ['b1', 'b2', 'X', 'b4'], unique('c')))).toEqual({
      A: 0,
      B: 0,
      C: 5,
    });
    // 5: an appeal makes A valid again, the bonus moves back from B to A
    expect(bonusOf(build(['a1', 'X', 'a3', 'a4'], unique('b'), unique('c'))).B).toBe(5);
    expect(bonusOf(build(unique('a'), unique('b'), unique('c'))).A).toBe(5);
  });

  test('6 nobody pressed Done: no bonus', () => {
    const subs = [sub('A', unique('a'), { finishedAt: null }), sub('B', unique('b'))];
    expect(bonusOf(subs)).toEqual({ A: 0, B: 0 });
  });

  test('7 identical timestamps: the earlier received event wins', () => {
    const subs = [
      sub('A', unique('a'), { finishedAt: t(1), finishOrder: 2 }),
      sub('B', unique('b'), { finishedAt: t(1), finishOrder: 1 }),
    ];
    expect(bonusOf(subs)).toEqual({ A: 0, B: 5 });
  });

  test('7b identical timestamps and no finishOrder: input order wins', () => {
    const subs = [
      sub('A', unique('a'), { finishedAt: t(1) }),
      sub('B', unique('b'), { finishedAt: t(1) }),
    ];
    expect(bonusOf(subs)).toEqual({ A: 5, B: 0 });
  });

  test('8 a player who never pressed Done is not eligible', () => {
    const subs = [sub('D', unique('d')), sub('E', ['e1', 'X', 'e3', 'e4'], { finishedAt: t(5) })];
    expect(bonusOf(subs)).toEqual({ D: 0, E: 0 });
    const withQualifier = [...subs, sub('F', unique('f'), { finishedAt: t(9) })];
    expect(bonusOf(withQualifier)).toEqual({ D: 0, E: 0, F: 5 });
  });

  test('9 everyone finished but nobody has four valid answers: no bonus', () => {
    const subs = [
      sub('A', ['a1', 'X', 'a3', 'a4'], { finishedAt: t(1) }),
      sub('B', ['b1', 'b2', '', 'b4'], { finishedAt: t(2) }),
    ];
    expect(bonusOf(subs)).toEqual({ A: 0, B: 0 });
  });

  test('10 never more than one bonus per round', () => {
    const subs = ['A', 'B', 'C', 'D'].map((id, i) =>
      sub(id, unique(id.toLowerCase()), { finishedAt: t(i) }),
    );
    const total = scoreRound(subs).reduce((sum, r) => sum + r.firstFinisherBonus, 0);
    expect(total).toBe(5);
  });

  test('Date objects work as finish times', () => {
    const subs = [
      sub('A', unique('a'), { finishedAt: new Date(2000) }),
      sub('B', unique('b'), { finishedAt: new Date(1000) }),
    ];
    expect(findBonusWinner(subs)).toBe('B');
  });

  test('no winner returns null', () => {
    expect(findBonusWinner([])).toBeNull();
    expect(all).toBe('ok');
  });
});

describe('complete round example from the Testing Playbook (letter C)', () => {
  test('Ana 25, Ben 30, Cy 20', () => {
    const subs = [
      sub('Ana', ['chris', 'canada', 'cat', 'cup'], { finishedAt: 1, finishOrder: 1 }),
      sub('Ben', ['chris', 'chile', 'cow', 'cup'], { finishedAt: 2, finishOrder: 2 }),
      sub('Cy', ['carl', 'canada', 'cat', ''], { finishedAt: 3, finishOrder: 3 }),
    ];
    const results = scoreRound(subs);
    const points = (r, c) => r.answers[c].points;
    expect(CATEGORIES.map((c) => results.map((r) => points(r, c)))).toEqual([
      [5, 5, 10],
      [5, 10, 5],
      [5, 10, 5],
      [5, 5, 0],
    ]);
    expect(results.map((r) => r.firstFinisherBonus)).toEqual([5, 0, 0]);
    expect(results.map((r) => r.roundScore)).toEqual([25, 30, 20]);
  });
});

describe('scoreSingleRound', () => {
  const four = Object.fromEntries(CATEGORIES.map((c) => [c, { verdict: 'valid' }]));
  const three = { ...four, thing: { verdict: 'invalid' } };

  test.each([
    ['4 valid, 60 s left', four, 0, 50],
    ['4 valid, 31 s left', four, 29, 46],
    ['4 valid, 0 s left', four, 60, 40],
    ['4 valid, past the deadline', four, 75, 40],
    ['3 valid, 30 s left: no bonus', three, 30, 30],
  ])('%s', (_label, answers, secondsUsed, expected) => {
    expect(scoreSingleRound({ answers, secondsUsed }).roundScore).toBe(expected);
  });

  test('all blank scores 0', () => {
    const answers = Object.fromEntries(CATEGORIES.map((c) => [c, { verdict: 'blank' }]));
    expect(scoreSingleRound({ answers, secondsUsed: 10 })).toEqual({
      answerPoints: 0,
      validCount: 0,
      timeBonus: 0,
      roundScore: 0,
    });
  });

  test('missing answers score 0', () => {
    expect(scoreSingleRound({ secondsUsed: 5 }).roundScore).toBe(0);
  });

  test('the time bonus never passes 10', () => {
    expect(scoreSingleRound({ answers: four, secondsUsed: -20 }).timeBonus).toBe(10);
  });

  test('equal scores: lower total time ranks higher', () => {
    const rows = [
      { id: 'slow', totalScore: 300, totalTimeMs: 90000 },
      { id: 'low', totalScore: 250, totalTimeMs: 10000 },
      { id: 'fast', totalScore: 300, totalTimeMs: 80000 },
    ];
    expect([...rows].sort(compareSingleScores).map((r) => r.id)).toEqual(['fast', 'slow', 'low']);
  });
});

describe('rankPlayers', () => {
  const p = (
    userId,
    totalScore,
    uniqueAnswers = 0,
    firstFinisherCount = 0,
    failedChallenges = 0,
  ) => ({
    userId,
    totalScore,
    uniqueAnswers,
    firstFinisherCount,
    failedChallenges,
  });
  const ids = (ranked) => ranked.map((r) => `${r.userId}:${r.rank}`);

  test('higher total wins; a failed challenge never changes the score order', () => {
    const ranked = rankPlayers([p('A', 100, 0, 0, 3), p('B', 110, 0, 0, 0)]);
    expect(ids(ranked)).toEqual(['B:1', 'A:2']);
  });

  test('same total: more unique answers wins', () => {
    expect(ids(rankPlayers([p('A', 100, 5), p('B', 100, 8)]))).toEqual(['B:1', 'A:2']);
  });

  test('same unique answers: more first-finisher bonuses wins', () => {
    expect(ids(rankPlayers([p('A', 100, 5, 1), p('B', 100, 5, 3)]))).toEqual(['B:1', 'A:2']);
  });

  test('same bonuses: fewer failed challenges wins', () => {
    expect(ids(rankPlayers([p('A', 100, 5, 2, 1), p('B', 100, 5, 2, 0)]))).toEqual(['B:1', 'A:2']);
  });

  test('still tied: shared rank, all winners, next rank skips (1, 1, 3)', () => {
    const ranked = rankPlayers([p('A', 100, 5, 2, 1), p('B', 100, 5, 2, 1), p('C', 80)]);
    expect(ids(ranked)).toEqual(['A:1', 'B:1', 'C:3']);
    expect(ranked.map((r) => r.isWinner)).toEqual([true, true, false]);
  });

  test('eight players with mixed ties', () => {
    const ranked = rankPlayers([
      p('H', 10),
      p('A', 90, 4),
      p('B', 90, 4),
      p('C', 90, 6),
      p('D', 120),
      p('E', 50),
      p('F', 50),
      p('G', 50, 0, 0, 2),
    ]);
    expect(ids(ranked)).toEqual(['D:1', 'C:2', 'A:3', 'B:3', 'E:5', 'F:5', 'G:7', 'H:8']);
  });

  test('keeps input order among exact ties and does not change the input', () => {
    const input = [p('B', 50), p('A', 50)];
    const copy = JSON.parse(JSON.stringify(input));
    expect(rankPlayers(input).map((r) => r.userId)).toEqual(['B', 'A']);
    expect(input).toEqual(copy);
  });

  test('empty and single player lists', () => {
    expect(rankPlayers([])).toEqual([]);
    expect(rankPlayers([p('A', 0)])[0]).toMatchObject({ rank: 1, isWinner: true });
  });
});
