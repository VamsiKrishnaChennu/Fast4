import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setSessionHint } from '../src/api/axiosClient.js';
import { serverNow } from '../src/utils/serverClock.js';
import { createFakeSocket, sampleRoom, samplePlayer } from './helpers/fakeSocket.js';
import { installFakeServer, sampleUser } from './helpers/fakeServer.js';
import { renderApp } from './helpers/renderApp.jsx';

const base = () => ({
  'GET /meta/config': () => ({ data: { data: { appVersion: '1', supportEmail: 'h@e.com' } } }),
  'POST /auth/refresh': () => ({ data: { accessToken: 'tok' } }),
  'GET /auth/me': () => ({ data: { user: sampleUser({ id: 'u1', nickname: 'Maya' }) } }),
});

const ok = (data) => ({ ok: true, data });
const players = [1, 2, 3].map((n) => samplePlayer(n));
const standing = (n, rank, totalScore, over = {}) => ({
  userId: `u${n}`,
  nickname: players[n - 1].nickname,
  avatarColor: players[n - 1].avatarColor,
  left: false,
  totalScore,
  uniqueAnswers: 4,
  firstFinisherCount: 1,
  failedChallenges: 0,
  rank,
  ...over,
});
const standings = [standing(1, 1, 70), standing(2, 2, 60), standing(3, 3, 50)];

/** A room in a game phase; `extra` adds the phase's own data. */
const gameRoom = (phase, extra = {}) =>
  sampleRoom({
    status: 'in_progress',
    phase,
    players,
    standings,
    totalRounds: 5,
    ...extra,
  });

const writing = (over = {}) =>
  gameRoom('WRITING', {
    round: {
      index: 2,
      startsAt: serverNow() - 5000,
      revealAt: serverNow() - 1000,
      roundMs: 60_000,
      letter: 'S',
      endsAt: serverNow() + 40_000,
      finished: [],
    },
    ...over,
  });

async function openRoom(room, handlers = {}) {
  installFakeServer(base());
  const socket = createFakeSocket({ 'room:join': () => ok({ room, rejoined: true }), ...handlers });
  renderApp('/room/K7Q2MX', { socket });
  return socket;
}

beforeEach(() => setSessionHint(true));
afterEach(() => vi.restoreAllMocks());

describe('toss', () => {
  test('shows the toss without a letter until the server sends it', async () => {
    await openRoom(
      gameRoom('LETTER_TOSS', {
        round: { index: 2, startsAt: serverNow(), revealAt: serverNow() + 4000, finished: [] },
      }),
    );
    expect(await screen.findByText("Everyone's letter is")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Get ready' })).toBeInTheDocument();
    expect(screen.getByText('Round 3 of 5')).toBeInTheDocument();
  });
});

describe('writing', () => {
  test('restores the draft after a reload and sends changes to the server', async () => {
    const user = userEvent.setup();
    const socket = await openRoom(
      writing({ myDraft: { name: 'Sara', place: '', animal: '', thing: '' }, mySubmitted: false }),
    );
    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Sara');
    expect(screen.getByText('Everyone is still writing')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Place' }), 'Spain');
    await waitFor(
      () =>
        expect(socket.calls('answer:draft').at(-1)?.payload).toEqual({
          roundIndex: 2,
          answers: { name: 'Sara', place: 'Spain', animal: '', thing: '' },
        }),
      { timeout: 2500 },
    );
  });

  test('Done needs four answers starting with the letter, then locks the fields', async () => {
    const user = userEvent.setup();
    const room = writing();
    const socket = await openRoom(room, {
      'answer:submit': () => ok({ finishOrder: 1 }),
    });
    const done = await screen.findByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Sara');
    await user.type(screen.getByRole('textbox', { name: 'Place' }), 'Spain');
    await user.type(screen.getByRole('textbox', { name: 'Animal' }), 'Snake');
    await user.type(screen.getByRole('textbox', { name: 'Thing' }), 'Tree');
    expect(done).toBeDisabled();
    await user.clear(screen.getByRole('textbox', { name: 'Thing' }));
    await user.type(screen.getByRole('textbox', { name: 'Thing' }), 'Sitar');
    expect(done).toBeEnabled();
    await user.click(done);
    expect(socket.calls('answer:submit')[0].payload).toEqual({
      roundIndex: 2,
      answers: { name: 'Sara', place: 'Spain', animal: 'Snake', thing: 'Sitar' },
    });
    // The server then sends the new state: this player finished first.
    act(() =>
      socket.receive(
        'room:state',
        writing({
          mySubmitted: true,
          myDraft: { name: 'Sara', place: 'Spain', animal: 'Snake', thing: 'Sitar' },
          round: { ...room.round, finished: [{ userId: 'u1', order: 1 }] },
        }),
      ),
    );
    expect(await screen.findByText('You finished first')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Writing').length).toBeGreaterThan(0);
  });

  test('shows who has finished', async () => {
    const room = writing();
    await openRoom({
      ...room,
      mySubmitted: true,
      myDraft: { name: 'Sara', place: 'Spain', animal: 'Snake', thing: 'Sitar' },
      round: {
        ...room.round,
        finished: [
          { userId: 'u2', order: 1 },
          { userId: 'u1', order: 2 },
        ],
      },
    });
    expect(await screen.findByText('You finished')).toBeInTheDocument();
    expect(screen.getAllByText('Finished').length).toBeGreaterThan(0);
  });

  test('a failed send shows a message and lets the player try again', async () => {
    const user = userEvent.setup();
    let calls = 0;
    await openRoom(writing(), {
      'answer:submit': () => {
        calls += 1;
        return calls === 1
          ? { ok: false, error: { code: 'INTERNAL', message: 'x' } }
          : ok({ finishOrder: 1 });
      },
    });
    for (const [label, text] of [
      ['Name', 'Sara'],
      ['Place', 'Spain'],
      ['Animal', 'Snake'],
      ['Thing', 'Sitar'],
    ]) {
      await user.type(await screen.findByRole('textbox', { name: label }), text);
    }
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send that');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(calls).toBe(2));
  });
});

const answer = (raw, verdict, points, count, over = {}) => ({
  raw,
  verdict,
  source: 'dictionary',
  reason: null,
  points,
  count,
  ...over,
});
const row = (n, answers, over = {}) => ({
  userId: `u${n}`,
  answers,
  finishOrder: n,
  firstFinisherBonus: 0,
  roundScore: 20,
  ...over,
});
const four = (name, place, animal, thing) => ({ name, place, animal, thing });

const review = (host = 'u1', extra = {}) =>
  gameRoom('REVIEW', {
    hostId: host,
    challengesLeft: 3,
    ...extra,
    review: {
      index: 2,
      letter: 'S',
      bonusWinnerId: 'u2',
      reviewEndsAt: serverNow() + 25_000,
      submissions: [
        row(
          1,
          four(
            answer('Sara', 'valid', 5, 2),
            answer('Spain', 'valid', 5, 2),
            answer('Snake', 'valid', 5, 2),
            answer('Sitar', 'invalid', 0, 0, { reason: 'not_in_dictionary' }),
          ),
          { roundScore: 15 },
        ),
        row(
          2,
          four(
            answer('Sara', 'valid', 5, 2),
            answer('Sweden', 'valid', 10, 1),
            answer('Snake', 'valid', 5, 2),
            answer('Sofa', 'valid', 10, 1),
          ),
          { roundScore: 35, firstFinisherBonus: 5 },
        ),
        row(
          3,
          four(
            answer('', 'blank', 0, 0),
            answer('Spain', 'valid', 5, 2),
            answer('Seal', 'valid', 10, 1),
            answer('Sock', 'valid', 10, 1),
          ),
          {
            roundScore: 25,
          },
        ),
      ],
    },
  });

describe('review', () => {
  test('shows every answer with its verdict, the bonus holder and my round score', async () => {
    await openRoom(review());
    expect(await screen.findByText('Round 3 review')).toBeInTheDocument();
    expect(screen.getByTestId('review-bonus')).toHaveTextContent('Bonus: Arjun');
    expect(screen.getByTestId('review-timer')).toHaveTextContent(/0:2\d/);
    const thing = screen.getByRole('region', { name: 'Thing' });
    expect(within(thing).getByText('Sitar')).toBeInTheDocument();
    expect(within(thing).getByText('Not in our dictionary')).toBeInTheDocument();
    expect(within(thing).getByText('Invalid 0')).toBeInTheDocument();
    expect(within(thing).getAllByText('Unique 10')).toHaveLength(2);
    const name = screen.getByRole('region', { name: 'Name' });
    expect(within(name).getAllByText('Shared 5')).toHaveLength(2);
    expect(within(name).getByText('Blank')).toBeInTheDocument();
    expect(within(name).getByText(/\+5 1st/)).toBeInTheDocument();
    expect(screen.getByTestId('my-round-score')).toHaveTextContent('15');
  });

  test('only the host sees Skip review', async () => {
    const user = userEvent.setup();
    const socket = await openRoom(review(), { 'review:skip': () => ok({}) });
    await user.click(await screen.findByRole('button', { name: 'Skip review' }));
    expect(socket.calls('review:skip')).toHaveLength(1);
  });

  test('a player who is not the host has no skip button', async () => {
    await openRoom(review('u2'));
    await screen.findByText('Round 3 review');
    expect(screen.queryByRole('button', { name: 'Skip review' })).not.toBeInTheDocument();
  });
});

describe('challenges and appeals', () => {
  const flags = () => screen.getByRole('region', { name: 'Name' });

  test('shows the challenges left, flags on others valid answers and Appeal only on my own unknown word', async () => {
    await openRoom(review());
    await screen.findByText('Round 3 review');
    expect(screen.getByTestId('challenges-left')).toHaveTextContent('3 challenges left');
    expect(screen.getByText(/Think an answer is wrong/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appeal Sitar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Challenge Sweden' })).toBeInTheDocument();
    // Not my own valid answer, not a blank, not someone's invalid answer.
    expect(screen.queryByRole('button', { name: 'Challenge Spain' })).toBeInTheDocument(); // u3's
    expect(screen.queryByRole('button', { name: /Challenge Sara/ })).toBeInTheDocument(); // u2's
    expect(within(flags()).getAllByRole('button')).toHaveLength(1);
  });

  test('asks first, then sends the challenge for that answer', async () => {
    const user = userEvent.setup();
    const socket = await openRoom(review(), {
      'challenge:create': () => ok({ challengeId: 'x', type: 'challenge' }),
    });
    await user.click(await screen.findByRole('button', { name: 'Challenge Sweden' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('You have 3 left');
    expect(socket.calls('challenge:create')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Check it' }));
    await waitFor(() => expect(socket.calls('challenge:create')).toHaveLength(1));
    expect(socket.calls('challenge:create')[0].payload).toEqual({
      roundIndex: 2,
      targetUserId: 'u2',
      category: 'place',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('cancel sends nothing', async () => {
    const user = userEvent.setup();
    const socket = await openRoom(review());
    await user.click(await screen.findByRole('button', { name: 'Appeal Sitar' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Appeal this answer?');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(socket.calls('challenge:create')).toHaveLength(0);
  });

  test('a refused challenge shows why and keeps the dialog open', async () => {
    const user = userEvent.setup();
    await openRoom(review(), {
      'challenge:create': () => ({
        ok: false,
        error: { code: 'CHALLENGE_DUPLICATE', message: 'x' },
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Challenge Sweden' }));
    await user.click(screen.getByRole('button', { name: 'Check it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already been checked');
  });

  test('shows Checking while a check runs and hides the flag for that answer', async () => {
    await openRoom(
      review('u1', {
        openChallenges: [
          {
            challengeId: 'c',
            roundIndex: 2,
            targetUserId: 'u2',
            initiatorId: 'u3',
            category: 'place',
            type: 'challenge',
          },
        ],
      }),
    );
    expect(await screen.findByTestId('checking-place')).toHaveTextContent('Checking…');
    expect(screen.queryByRole('button', { name: 'Challenge Sweden' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A word check is still running.' })).toBeDisabled();
  });

  test.each([
    ['challenge', 'upheld', 'Confirmed'],
    ['challenge', 'overturned', 'Removed'],
    ['appeal', 'overturned', 'Accepted'],
    ['appeal', 'upheld', 'Still invalid'],
    ['challenge', 'inconclusive', 'Could not decide'],
  ])('a finished %s that was %s shows "%s"', async (type, outcome, label) => {
    await openRoom(
      review('u1', { checked: [{ targetUserId: 'u2', category: 'place', type, outcome }] }),
    );
    expect(await screen.findByTestId('checked-place')).toHaveTextContent(label);
  });

  test('no buttons when none are left or the review is closing', async () => {
    await openRoom(review('u1', { challengesLeft: 0 }));
    await screen.findByText('Round 3 review');
    expect(screen.getByTestId('challenges-left')).toHaveTextContent('0 challenges left');
    expect(screen.queryByRole('button', { name: /Challenge |Appeal / })).not.toBeInTheDocument();
  });

  test('closing review waits for the last check', async () => {
    const room = review();
    room.review.closing = true;
    await openRoom(room);
    expect(await screen.findByText('Finishing the last check…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Challenge |Appeal / })).not.toBeInTheDocument();
  });

  test('tells only the player who asked when a check could not run', async () => {
    const socket = await openRoom(review());
    await screen.findByText('Round 3 review');
    act(() =>
      socket.receive('challenge:resolved', { outcome: 'error', initiatorId: 'u2', roundIndex: 2 }),
    );
    expect(screen.queryByTestId('check-error')).not.toBeInTheDocument();
    act(() =>
      socket.receive('challenge:resolved', { outcome: 'error', initiatorId: 'u1', roundIndex: 2 }),
    );
    expect(await screen.findByTestId('check-error')).toHaveTextContent(
      'Could not check right now, try again.',
    );
  });
});

describe('round results', () => {
  const results = (isLast = false) =>
    gameRoom('ROUND_RESULT', {
      results: {
        index: 2,
        isLast,
        shownAt: serverNow(),
        nextAt: serverNow() + 8000,
        standings,
        breakdown: [
          {
            userId: 'u1',
            answerPoints: { name: 5, place: 5, animal: 5, thing: 10 },
            firstFinisherBonus: 5,
            roundScore: 30,
            totalScore: 70,
            previousRank: 2,
            rank: 1,
          },
          {
            userId: 'u2',
            answerPoints: { name: 5, place: 10, animal: 5, thing: 10 },
            firstFinisherBonus: 0,
            roundScore: 30,
            totalScore: 60,
            previousRank: 1,
            rank: 2,
          },
          {
            userId: 'u3',
            answerPoints: { name: 0, place: 5, animal: 10, thing: 10 },
            firstFinisherBonus: 0,
            roundScore: 25,
            totalScore: 50,
            previousRank: 3,
            rank: 3,
          },
        ],
      },
    });

  test('shows standings with movement and my round breakdown', async () => {
    await openRoom(results());
    expect(await screen.findByRole('heading', { name: 'Standings' })).toBeInTheDocument();
    const me = screen.getByTestId('standing-u1');
    expect(within(me).getByText('You')).toBeInTheDocument();
    expect(within(me).getByText('70')).toBeInTheDocument();
    expect(within(me).getByLabelText('Moved up')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('standing-u2')).getByLabelText('Moved down'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('standing-u3')).getByLabelText('Same place'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('my-round-score')).toHaveTextContent('30');
    expect(screen.getByText('First finisher bonus +5')).toBeInTheDocument();
    expect(screen.getByText(/Next letter in \d seconds/)).toBeInTheDocument();
  });

  test('the last round says final results are next', async () => {
    await openRoom(results(true));
    expect(await screen.findByText(/Final results in \d seconds/)).toBeInTheDocument();
  });
});

describe('game over', () => {
  const over = (host = 'u1') =>
    gameRoom('GAME_OVER', {
      status: 'finished',
      hostId: host,
      gameOver: {
        standings,
        winnerIds: ['u1'],
        reason: 'completed',
        stats: {
          u1: { uniqueAnswers: 12, firstFinisherCount: 3, failedChallenges: 1 },
          u2: { uniqueAnswers: 9, firstFinisherCount: 1, failedChallenges: 0 },
          u3: { uniqueAnswers: 7, firstFinisherCount: 0, failedChallenges: 0 },
        },
      },
    });

  test('the winner sees the podium, their facts and Play again', async () => {
    const user = userEvent.setup();
    const socket = await openRoom(over(), {
      'game:playAgain': () =>
        ok({ room: sampleRoom({ players, hostId: 'u1', standings: [], phase: 'LOBBY' }) }),
    });
    expect(await screen.findByTestId('game-over-title')).toHaveTextContent('You won!');
    expect(screen.getByTestId('game-over-you')).toHaveTextContent('You came first with 70 points.');
    expect(screen.getByText('12')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(socket.calls('game:playAgain')).toHaveLength(1);
    expect(await screen.findByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
  });

  test('another player sees who won and waits for the host', async () => {
    const room = over('u2');
    await openRoom({
      ...room,
      gameOver: {
        ...room.gameOver,
        winnerIds: ['u2'],
        standings: [standing(2, 1, 80), standing(1, 2, 70), standing(3, 3, 50)],
      },
    });
    expect(await screen.findByTestId('game-over-title')).toHaveTextContent('Arjun wins!');
    expect(screen.getByTestId('game-over-you')).toHaveTextContent(
      'You came second with 70 points.',
    );
    expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for the host to start another game.')).toBeInTheDocument();
  });
});

describe('leaving a game', () => {
  test('asks first, and Stay keeps the player in the game', async () => {
    const user = userEvent.setup();
    const socket = await openRoom(review(), { 'room:leave': () => ok({}) });
    await user.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(screen.getByText('Leave this game?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.queryByText('Leave this game?')).not.toBeInTheDocument();
    expect(socket.calls('room:leave')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(socket.calls('room:leave')).toHaveLength(1));
  });
});
