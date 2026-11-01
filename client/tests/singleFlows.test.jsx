import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { setSessionHint } from '../src/api/axiosClient.js';
import { renderApp } from './helpers/renderApp.jsx';
import { apiError, installFakeServer, sampleUser } from './helpers/fakeServer.js';

const base = (user = sampleUser()) => ({
  'GET /meta/config': () => ({ data: { data: { appVersion: '1', supportEmail: 'h@e.com' } } }),
  'POST /auth/refresh': () => ({ data: { accessToken: 'tok' } }),
  'GET /auth/me': () => ({ data: { user } }),
});

const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const openRound = (index, letter = 'T', { startsInMs = -1000, endsInMs = 50_000 } = {}) => ({
  index,
  letter,
  startedAt: iso(startsInMs),
  endsAt: iso(endsInMs),
  serverNow: Date.now(),
});
const verdict = (raw, ok = true, reason = null) => ({
  raw,
  verdict: raw ? (ok ? 'valid' : 'invalid') : 'blank',
  reason,
  points: ok ? 10 : 0,
});
const result = (over = {}) => ({
  index: 0,
  verdicts: {
    name: verdict('Tara'),
    place: verdict('Tokyo'),
    animal: verdict('Tiger'),
    thing: verdict('Table'),
  },
  points: { name: 10, place: 10, animal: 10, thing: 10 },
  timeBonus: 6,
  roundScore: 46,
  secondsUsed: 29,
  missed: false,
  totalScore: 46,
  isLast: false,
  ...over,
});
const game = (over = {}) => ({
  id: 'g1',
  status: 'in_progress',
  rounds: 5,
  roundSeconds: 60,
  totalScore: 0,
  results: [],
  round: null,
  serverNow: Date.now(),
  ...over,
});

const fillAll = async (user, words = ['Tara', 'Tokyo', 'Tiger', 'Table']) => {
  const fields = ['Name', 'Place', 'Animal', 'Thing'];
  for (let i = 0; i < fields.length; i += 1) {
    await user.type(screen.getByLabelText(fields[i]), words[i]);
  }
};

beforeEach(() => {
  setSessionHint(true);
  sessionStorage.clear();
});

describe('solo setup', () => {
  test('shows the best for the chosen rounds and starts a game with that many', async () => {
    const user = userEvent.setup();
    const server = installFakeServer({
      ...base(sampleUser({ stats: { bestByRounds: { 10: 412, 5: 150 } } })),
      'POST /single/games': () => ({
        status: 201,
        data: { gameId: 'g1', rounds: 15, roundSeconds: 60 },
      }),
      'GET /single/games/g1': () => ({ data: game({ round: openRound(0) }) }),
    });
    renderApp('/single');
    expect(await screen.findByText('How many rounds?')).toBeInTheDocument();
    expect(screen.getByTestId('best')).toHaveTextContent('Your best for 10 rounds412');
    await user.click(screen.getByRole('radio', { name: '5 rounds' }));
    expect(screen.getByTestId('best')).toHaveTextContent('Your best for 5 rounds150');
    await user.click(screen.getByRole('radio', { name: '15 rounds' }));
    expect(screen.getByTestId('best')).toHaveTextContent('No score yet');
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    await screen.findByText('Round 1 of 5');
    expect(server.calls.find((c) => c.key === 'POST /single/games').body).toEqual({ rounds: 15 });
  });

  test('shows the server message when the game cannot be created', async () => {
    const user = userEvent.setup();
    installFakeServer({
      ...base(),
      'POST /single/games': () =>
        apiError(400, 'VALIDATION_ERROR', 'Choose 5, 10, 15 or 20 rounds.'),
    });
    renderApp('/single');
    await user.click(await screen.findByRole('button', { name: 'Start game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose 5, 10, 15 or 20 rounds.');
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled();
  });
});

describe('playing a round', () => {
  test('fresh game: starts round one, Done waits for four good answers, then shows the result', async () => {
    const user = userEvent.setup();
    const server = installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({ data: game() }),
      'POST /single/games/g1/rounds/next': () => ({ data: openRound(0) }),
      'POST /single/games/g1/rounds/0/submit': () => ({ data: result() }),
    });
    renderApp('/single/play/g1');
    expect(await screen.findByText('Round 1 of 5')).toBeInTheDocument();
    expect(screen.getByText('Every answer must start with T.')).toBeInTheDocument();
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();
    await fillAll(user, ['Tara', 'Tokyo', 'Tiger', 'Alex']); // last one starts with the wrong letter
    expect(done).toBeDisabled();
    await user.clear(screen.getByLabelText('Thing'));
    await user.type(screen.getByLabelText('Thing'), 'Table');
    expect(done).toBeEnabled();
    await user.click(done);
    expect(await screen.findByTestId('round-score')).toHaveTextContent('46');
    expect(screen.getByText('All four valid')).toBeInTheDocument();
    expect(screen.getByTestId('time-bonus')).toHaveTextContent('Finished with 31 seconds left');
    expect(screen.getByTestId('total')).toHaveTextContent('46');
    const submit = server.calls.find((c) => c.key === 'POST /single/games/g1/rounds/0/submit');
    expect(submit.body).toEqual({
      answers: { name: 'Tara', place: 'Tokyo', animal: 'Tiger', thing: 'Table' },
    });
  });

  test('Next round asks for a new round and shows its letter', async () => {
    const user = userEvent.setup();
    let calls = 0;
    installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({
        data: game({ totalScore: 46, results: [result()], round: null }),
      }),
      'POST /single/games/g1/rounds/next': () => {
        calls += 1;
        return { data: openRound(1, 'C') };
      },
    });
    renderApp('/single/play/g1');
    expect(await screen.findByTestId('round-score')).toHaveTextContent('46');
    await user.click(screen.getByRole('button', { name: 'Next round' }));
    expect(await screen.findByText('Round 2 of 5')).toBeInTheDocument();
    expect(screen.getByText('Every answer must start with C.')).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  test('invalid answers show a reason on the result card', async () => {
    installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({
        data: game({
          totalScore: 30,
          results: [
            result({
              roundScore: 30,
              timeBonus: 0,
              totalScore: 30,
              verdicts: {
                name: verdict('Tara'),
                place: verdict('Tokyo'),
                animal: verdict('Tiger'),
                thing: verdict('Tbl', false, 'not_in_dictionary'),
              },
              points: { name: 10, place: 10, animal: 10, thing: 0 },
            }),
          ],
        }),
      }),
    });
    renderApp('/single/play/g1');
    expect(await screen.findByText('3 of 4 valid')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('row-thing')).getByText(/Not in our dictionary/),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('row-thing')).getByText('+0')).toBeInTheDocument();
    expect(screen.queryByTestId('time-bonus')).not.toBeInTheDocument();
    expect(screen.getByText(/Finish with all four valid/)).toBeInTheDocument();
  });

  test('reload mid-round resumes the open round and its saved answers', async () => {
    const user = userEvent.setup();
    installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({
        data: game({ round: openRound(2, 'S', { endsInMs: 20_000 }) }),
      }),
    });
    sessionStorage.setItem('ff-draft-g1-2', JSON.stringify({ name: 'Sam' }));
    renderApp('/single/play/g1');
    expect(await screen.findByText('Round 3 of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Sam');
    expect(screen.getByTestId('clock')).toHaveTextContent(/^0:(19|20)$/);
    await user.type(screen.getByLabelText('Place'), 'Spain');
    expect(JSON.parse(sessionStorage.getItem('ff-draft-g1-2')).place).toBe('Spain');
  });

  test('when the timer runs out the typed answers are sent by themselves', async () => {
    const user = userEvent.setup();
    const server = installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({
        data: game({ round: openRound(0, 'T', { endsInMs: 900 }) }),
      }),
      'POST /single/games/g1/rounds/0/submit': () => ({
        data: result({
          roundScore: 10,
          timeBonus: 0,
          totalScore: 10,
          verdicts: {
            ...result().verdicts,
            place: verdict(''),
            animal: verdict(''),
            thing: verdict(''),
          },
        }),
      }),
    });
    renderApp('/single/play/g1');
    await user.type(await screen.findByLabelText('Name'), 'Tara');
    await waitFor(() => expect(server.calls.some((c) => c.key.endsWith('/submit'))).toBe(true), {
      timeout: 4000,
    });
    expect(server.calls.find((c) => c.key.endsWith('/submit')).body.answers.name).toBe('Tara');
    expect(await screen.findByTestId('round-score')).toHaveTextContent('10');
  });

  test('a failed send shows an error and the answers can be sent again', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({ data: game({ round: openRound(0) }) }),
      'POST /single/games/g1/rounds/0/submit': () => {
        attempts += 1;
        return attempts === 1 ? apiError(500, 'INTERNAL', 'Boom') : { data: result() };
      },
    });
    renderApp('/single/play/g1');
    await screen.findByText('Round 1 of 5');
    await fillAll(user);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Tara');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByTestId('round-score')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  test('ROUND_EXPIRED reloads the game and shows the missed round', async () => {
    const user = userEvent.setup();
    let expired = false;
    installFakeServer({
      ...base(),
      'GET /single/games/g1': () =>
        expired
          ? {
              data: game({
                results: [result({ missed: true, roundScore: 0, timeBonus: 0, totalScore: 0 })],
              }),
            }
          : { data: game({ round: openRound(0) }) },
      'POST /single/games/g1/rounds/0/submit': () => {
        expired = true;
        return apiError(409, 'ROUND_EXPIRED', 'Time ran out for this round.');
      },
    });
    renderApp('/single/play/g1');
    await screen.findByText('Round 1 of 5');
    await fillAll(user);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Time ran out')).toBeInTheDocument();
    expect(screen.getByTestId('round-score')).toHaveTextContent('0');
  });
});

describe('the toss', () => {
  test('shows the letter and the countdown until writing starts', async () => {
    installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({
        data: game({ round: openRound(0, 'W', { startsInMs: 3500, endsInMs: 63_500 }) }),
      }),
    });
    renderApp('/single/play/g1');
    expect(await screen.findByText('Get ready')).toBeInTheDocument();
    expect(screen.getByText(/Writing starts in [34]/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });
});

describe('leaving', () => {
  test('Stay keeps the game, Leave quits and goes home', async () => {
    const user = userEvent.setup();
    const server = installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({ data: game({ round: openRound(0) }) }),
      'POST /single/games/g1/quit': () => ({ data: { status: 'abandoned' } }),
    });
    renderApp('/single/play/g1');
    await screen.findByText('Round 1 of 5');
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave this game?' });
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leave' }),
    );
    expect(await screen.findByText('Ready, Maya?')).toBeInTheDocument();
    expect(server.calls.some((c) => c.key === 'POST /single/games/g1/quit')).toBe(true);
  });
});

describe('game over', () => {
  const finished = (summary = {}) =>
    game({
      status: 'finished',
      totalScore: 210,
      results: [46, 40, 50, 30, 44].map((roundScore, index) => result({ index, roundScore })),
      summary: {
        totalScore: 210,
        newPersonalBest: true,
        validAnswers: 19,
        possibleAnswers: 20,
        fastestRoundSeconds: 18,
        rankToday: 14,
        ...summary,
      },
    });

  test('shows the total, the personal best banner, the facts and one bar per round', async () => {
    installFakeServer({ ...base(), 'GET /single/games/g1': () => ({ data: finished() }) });
    renderApp('/single/play/g1');
    expect(await screen.findByTestId('final-score')).toHaveTextContent('210');
    expect(screen.getByTestId('pb')).toHaveTextContent('New personal best');
    expect(screen.getByText('points in 5 rounds')).toBeInTheDocument();
    expect(screen.getByText('19/20')).toBeInTheDocument();
    expect(screen.getByText('18s')).toBeInTheDocument();
    expect(screen.getByText('#14')).toBeInTheDocument();
    expect(screen.getByText('Best 50')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /Round \d of 5/ })).toHaveLength(5);
  });

  test('no banner without a personal best, and dashes when there is no rank or fastest round', async () => {
    installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({
        data: finished({ newPersonalBest: false, rankToday: null, fastestRoundSeconds: null }),
      }),
    });
    renderApp('/single/play/g1');
    await screen.findByTestId('final-score');
    expect(screen.queryByTestId('pb')).not.toBeInTheDocument();
    expect(screen.getAllByText('–')).toHaveLength(2);
  });

  test('Play again starts a new game with the same number of rounds', async () => {
    const user = userEvent.setup();
    const server = installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({ data: finished() }),
      'POST /single/games': () => ({
        status: 201,
        data: { gameId: 'g2', rounds: 5, roundSeconds: 60 },
      }),
      'GET /single/games/g2': () => ({ data: game({ id: 'g2', round: openRound(0) }) }),
    });
    renderApp('/single/play/g1');
    await user.click(await screen.findByRole('button', { name: 'Play again' }));
    await screen.findByText('Round 1 of 5');
    expect(server.calls.find((c) => c.key === 'POST /single/games').body).toEqual({ rounds: 5 });
  });

  test('finishing refreshes the player so Home shows the new best', async () => {
    let me = 0;
    installFakeServer({
      ...base(),
      'GET /auth/me': () => {
        me += 1;
        return { data: { user: sampleUser({ stats: { bestSingleScore: me > 1 ? 210 : 100 } }) } };
      },
      'GET /single/games/g1': () => ({ data: finished() }),
    });
    const user = userEvent.setup();
    renderApp('/single/play/g1');
    await screen.findByTestId('final-score');
    await waitFor(() => expect(me).toBeGreaterThan(1));
    await user.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(await screen.findByText('210')).toBeInTheDocument();
  });
});

describe('loading problems', () => {
  test('a game that cannot be loaded offers a retry', async () => {
    const user = userEvent.setup();
    let fail = true;
    installFakeServer({
      ...base(),
      'GET /single/games/g1': () =>
        fail
          ? apiError(404, 'NOT_FOUND', 'Game not found.')
          : { data: game({ round: openRound(0) }) },
    });
    renderApp('/single/play/g1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Game not found.');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Round 1 of 5')).toBeInTheDocument();
  });

  test('an abandoned game sends the player back to setup', async () => {
    installFakeServer({
      ...base(),
      'GET /single/games/g1': () => ({ data: game({ status: 'abandoned' }) }),
    });
    renderApp('/single/play/g1');
    expect(await screen.findByText('How many rounds?')).toBeInTheDocument();
  });
});

describe('ranks', () => {
  const entry = (rank, nickname, totalScore, extra = {}) => ({
    rank,
    userId: `u${rank}`,
    nickname,
    totalScore,
    totalTimeMs: 310_000,
    avatarColor: '#FFC247',
    isYou: false,
    ...extra,
  });

  test('lists the best games and pins the player below the list', async () => {
    const user = userEvent.setup();
    const calls = [];
    installFakeServer({
      ...base(),
      'GET /leaderboards/single': (config) => {
        calls.push(config.params);
        const entries = Array.from({ length: 10 }, (_, i) =>
          entry(i + 1, `P${i + 1}`, 500 - i * 10),
        );
        return {
          data: { entries, you: entry(14, 'Maya', 412, { isYou: true }) },
        };
      },
    });
    renderApp('/ranks');
    expect(await screen.findAllByTestId('rank-row')).toHaveLength(11);
    expect(calls[0]).toEqual({ period: 'weekly', rounds: 10 });
    const you = screen.getByTestId('you');
    expect(within(you).getByText('You')).toBeInTheDocument();
    expect(within(you).getByText('412')).toBeInTheDocument();
    expect(within(you).getByText('10 rounds, 31s avg')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All time' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ period: 'all', rounds: 10 }));
    await user.click(screen.getByRole('button', { name: /Rounds: 10/ }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ period: 'all', rounds: 15 }));
  });

  test('shows an empty message, and a message for the group tab', async () => {
    const user = userEvent.setup();
    installFakeServer({
      ...base(),
      'GET /leaderboards/single': () => ({ data: { entries: [], you: null } }),
    });
    renderApp('/ranks');
    expect(await screen.findByText(/No finished games yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Group' }));
    expect(screen.getByText(/Group ranks arrive/)).toBeInTheDocument();
  });

  test('a failed load shows an error', async () => {
    installFakeServer({
      ...base(),
      'GET /leaderboards/single': () => apiError(500, 'INTERNAL', 'Nope'),
    });
    renderApp('/ranks');
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope');
  });
});
