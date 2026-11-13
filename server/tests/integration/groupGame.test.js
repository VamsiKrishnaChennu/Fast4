import { Game } from '../../src/models/Game.js';
import { Round } from '../../src/models/Round.js';
import { Submission } from '../../src/models/Submission.js';
import { User } from '../../src/models/User.js';
import { clearDb, startTestDb, stopTestDb } from '../helpers/testDb.js';
import { startRealtimeServer, tick } from '../helpers/realtimeHelpers.js';

let rt;

beforeAll(startTestDb, 120_000);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearDb();
  rt = await startRealtimeServer();
});
afterEach(async () => {
  await rt.close();
});

const answers = (name, place, animal, thing) => ({ name, place, animal, thing });

/** Three connected players in a room, ready to start. */
async function table(rounds = 5) {
  const [maya, ben, cy] = [
    await rt.player('Maya'),
    await rt.player('Ben'),
    await rt.player('Cyrus'),
  ];
  const created = await maya.emitAck('room:create', { settings: { maxPlayers: 8, rounds } });
  const code = created.data.code;
  await ben.emitAck('room:join', { code });
  await cy.emitAck('room:join', { code });
  return { maya, ben, cy, code };
}

describe('a game over real sockets', () => {
  test('three players play five rounds and the results are saved', async () => {
    const { maya, ben, cy } = await table(5);
    expect((await maya.emitAck('game:start', {})).ok).toBe(true);
    rt.clock.advance(3000);
    await tick();
    expect((await ben.waitFor('round:toss')).index).toBe(0);
    expect(JSON.stringify(ben.log.filter((e) => e.event === 'round:toss'))).not.toContain('letter');
    rt.clock.advance(4000);
    const started = await maya.waitFor('round:started');
    expect(started.letter).toBe('T');

    const plays = [
      [
        'T',
        [
          answers('Tara', 'Tokyo', 'Tiger', 'Table'),
          answers('Tom', 'Tokyo', 'Tiger', 'Tree'),
          answers('Tara', 'Texas', 'Tiger', 'Tabel'),
        ],
      ],
      [
        'C',
        [
          answers('Chris', 'Canada', 'Cat', 'Cup'),
          answers('Cy', 'Chile', 'Cow', 'Chair'),
          answers('Carl', 'China', 'Cobra', 'Clock'),
        ],
      ],
      [
        'S',
        [
          answers('Sam', 'Spain', 'Seal', 'Sofa'),
          answers('Sara', 'Spain', 'Snake', 'Sock'),
          answers('Sita', 'Sweden', 'Sloth', 'Spoon'),
        ],
      ],
      [
        'A',
        [
          answers('Alex', 'Albania', 'Ant', 'Apple'),
          answers('Alex', 'Albania', 'Ape', 'Apple'),
          answers('Amy', 'Ankara', 'Ape', 'Apple'),
        ],
      ],
      [
        'B',
        [
          answers('Ben', 'Boston', 'Bear', 'Bus'),
          answers('Ben', 'Boston', 'Bat', 'Bus'),
          answers('Bella', 'Bolivia', 'Bat', 'Book'),
        ],
      ],
    ];
    const players = [maya, ben, cy];
    for (let index = 0; index < plays.length; index += 1) {
      const [, typed] = plays[index];
      // Everyone presses Done, so the round ends as soon as the last one does.
      for (let p = 0; p < 3; p += 1) {
        const ack = await players[p].emitAck('answer:submit', {
          roundIndex: index,
          answers: typed[p],
        });
        expect(ack).toEqual({ ok: true, data: { finishOrder: p + 1 } });
      }
      const review = await cy.waitFor('round:review', (r) => r.index === index);
      expect(review.submissions).toHaveLength(3);
      rt.clock.advance(30_000);
      const results = await cy.waitFor('round:results', (r) => r.index === index);
      expect(results.standings).toHaveLength(3);
      rt.clock.advance(10_000);
      await tick();
      if (index < 4) rt.clock.advance(4000);
    }
    const over = await maya.waitFor('game:over');
    expect(over.standings).toHaveLength(3);
    expect(over.standings[0].rank).toBe(1);
    await tick(200);

    const game = await Game.findOne({ mode: 'group' }).lean();
    expect(game.status).toBe('finished');
    expect(game.letters).toEqual(['T', 'C', 'S', 'A', 'B']);
    expect(game.players).toHaveLength(3);
    expect(game.winnerIds.map(String)).toEqual(over.winnerIds);
    expect(await Round.countDocuments({ gameId: game._id, status: 'complete' })).toBe(5);
    expect(await Submission.countDocuments({ gameId: game._id })).toBe(15);
    const top = await User.findOne({ _id: over.standings[0].userId }).lean();
    expect(top.stats).toMatchObject({ gamesPlayed: 1, groupGamesPlayed: 1, groupWins: 1 });
    expect(top.stats.groupTotalScore).toBe(over.standings[0].totalScore);
  }, 30_000);

  test('bad payloads are refused and Done is idempotent', async () => {
    const { maya, ben } = await table(5);
    await maya.emitAck('game:start', {});
    rt.clock.advance(7000);
    await tick();
    const bad = await ben.emitAck('answer:submit', {
      roundIndex: 0,
      answers: { name: 'x', hacker: 1 },
    });
    expect(bad.ok).toBe(false);
    expect(bad.error.code).toBe('VALIDATION_ERROR');
    const typed = answers('Tara', 'Tokyo', 'Tiger', 'Table');
    await ben.emitAck('answer:submit', { roundIndex: 0, answers: typed });
    const again = await ben.emitAck('answer:submit', { roundIndex: 0, answers: typed });
    expect(again).toEqual({ ok: true, data: { finishOrder: 1 } });
    const flagged = ben.log.filter((e) => e.event === 'round:playerFinished');
    expect(flagged).toHaveLength(1);
    expect(flagged[0].payload).toEqual({ userId: ben.user.id ?? ben.user._id, order: 1 });
  });

  test('only the host can skip the review and play again', async () => {
    const { maya, ben } = await table(5);
    await maya.emitAck('game:start', {});
    rt.clock.advance(7000);
    rt.clock.advance(60_000 + 1500);
    await maya.waitFor('round:review');
    expect((await ben.emitAck('review:skip', {})).error.code).toBe('NOT_HOST');
    expect((await maya.emitAck('review:skip', {})).ok).toBe(true);
    expect((await ben.emitAck('game:playAgain', {})).error.code).toBe('NOT_HOST');
    expect((await maya.emitAck('game:playAgain', {})).error.code).toBe('INVALID_PHASE');
  });

  test('a reconnecting player gets their draft back in the room snapshot', async () => {
    const { maya, ben, code } = await table(5);
    await maya.emitAck('game:start', {});
    rt.clock.advance(7000);
    await tick();
    await ben.emitAck('answer:draft', { roundIndex: 0, answers: answers('Tom', 'Tok', '', '') });
    ben.socket.close();
    await tick();
    const back = await rt.connect(ben.token).ready();
    await tick(100);
    const state = back.lastState();
    expect(state).toMatchObject({ code, phase: 'WRITING', round: { index: 0, letter: 'T' } });
    expect(state.myDraft).toEqual(answers('Tom', 'Tok', '', ''));
  });
});
