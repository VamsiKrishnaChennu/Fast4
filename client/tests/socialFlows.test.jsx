import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setSessionHint } from '../src/api/axiosClient.js';
import { createFakeSocket, sampleRoom, samplePlayer } from './helpers/fakeSocket.js';
import { installFakeServer, sampleUser } from './helpers/fakeServer.js';
import { renderApp } from './helpers/renderApp.jsx';

const ok = (data) => ({ ok: true, data });
const base = (extra = {}) => ({
  'GET /meta/config': () => ({ data: { data: { appVersion: '1', supportEmail: 'h@e.com' } } }),
  'POST /auth/refresh': () => ({ data: { accessToken: 'tok' } }),
  'GET /auth/me': () => ({ data: { user: sampleUser({ id: 'u1', nickname: 'Maya' }) } }),
  'GET /blocks': () => ({ data: { blocks: [] } }),
  ...extra,
});
const msg = (id, userId, nickname, text) => ({
  id,
  userId,
  nickname,
  avatarColor: '#FFC247',
  text,
  at: 1,
});
const lobbyRoom = () =>
  sampleRoom({ players: [samplePlayer(1), samplePlayer(2)], status: 'lobby', phase: 'LOBBY' });

beforeEach(() => setSessionHint(true));
afterEach(() => vi.restoreAllMocks());

async function openLobby(routes = {}, handlers = {}) {
  const server = installFakeServer(base(routes));
  const socket = createFakeSocket({
    'room:join': () => ok({ room: lobbyRoom(), rejoined: true }),
    ...handlers,
  });
  renderApp('/room/K7Q2MX', { socket });
  await screen.findByRole('heading', { name: 'Lobby' });
  return { socket, server };
}
const openChat = async (user) => {
  await user.click(await screen.findByRole('button', { name: /Open chat/ }));
  return screen.findByRole('dialog', { name: 'Chat' });
};

describe('chat', () => {
  test('shows history, sends a message and receives new ones as plain text', async () => {
    const user = userEvent.setup();
    const { socket } = await openLobby(
      {},
      { 'chat:send': () => ok({ message: msg('m9', 'u1', 'Maya', 'hi all') }) },
    );
    act(() =>
      socket.receive('chat:history', { messages: [msg('m1', 'u2', 'Player2', 'welcome')] }),
    );
    const dialog = await openChat(user);
    expect(within(dialog).getByText('welcome')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Terms of Use' })).toHaveAttribute(
      'href',
      '/terms',
    );

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Write a message' }),
      '  hi   all ',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(socket.calls('chat:send').at(-1).payload).toEqual({ text: 'hi all' }),
    );

    act(() =>
      socket.receive('chat:message', { message: msg('m2', 'u2', 'Player2', '<b>bold</b> **') }),
    );
    expect(await within(dialog).findByText('<b>bold</b> **')).toBeInTheDocument();
    expect(dialog.querySelector('b')).toBeNull();
  });

  test('server errors are shown in plain words', async () => {
    const user = userEvent.setup();
    await openLobby(
      {},
      {
        'chat:send': () => ({ ok: false, error: { code: 'MUTED', message: 'muted' } }),
      },
    );
    const dialog = await openChat(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Write a message' }), 'hello');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'You are muted and cannot chat for now.',
    );
  });

  test('the chat button is not offered while a round is running', async () => {
    installFakeServer(base());
    const room = sampleRoom({
      status: 'in_progress',
      phase: 'WRITING',
      players: [samplePlayer(1), samplePlayer(2)],
      round: {
        index: 0,
        startsAt: Date.now() - 5000,
        revealAt: Date.now() - 1000,
        roundMs: 60_000,
        letter: 'S',
        endsAt: Date.now() + 40_000,
        finished: [],
      },
      totalRounds: 5,
    });
    renderApp('/room/K7Q2MX', {
      socket: createFakeSocket({ 'room:join': () => ok({ room, rejoined: true }) }),
    });
    await screen.findByRole('textbox', { name: 'Name' });
    expect(screen.queryByRole('button', { name: /Open chat/ })).toBeNull();
  });

  test('report: choose a reason, add a note and send', async () => {
    const user = userEvent.setup();
    const { socket, server } = await openLobby({
      'POST /reports': () => ({ status: 201, data: { id: 'r1' } }),
    });
    act(() =>
      socket.receive('chat:history', { messages: [msg('m1', 'u2', 'Player2', 'rude text')] }),
    );
    const dialog = await openChat(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Actions for the message from Player2' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Report message' }));
    await user.click(screen.getByRole('radio', { name: 'Hate speech' }));
    await user.type(screen.getByRole('textbox', { name: /Anything else/ }), 'please check');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() =>
      expect(server.calls.find((c) => c.key === 'POST /reports').body).toEqual({
        targetUserId: 'u2',
        context: 'chat',
        refId: 'm1',
        reason: 'hate',
        details: 'please check',
      }),
    );
    expect(await within(dialog).findByText('Thanks, we will take a look.')).toBeInTheDocument();
  });

  test('block: confirm hides their messages, and new ones stay hidden', async () => {
    const user = userEvent.setup();
    const { socket, server } = await openLobby({
      'POST /blocks': () => ({
        status: 201,
        data: { blocks: [{ userId: 'u2', nickname: 'Player2', avatarColor: '#FFC247' }] },
      }),
    });
    act(() =>
      socket.receive('chat:history', { messages: [msg('m1', 'u2', 'Player2', 'rude text')] }),
    );
    const dialog = await openChat(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Actions for the message from Player2' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Block player' }));
    expect(screen.getByText(/They stay in the game and scores do not change/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(within(dialog).queryByText('rude text')).toBeNull());
    expect(server.calls.find((c) => c.key === 'POST /blocks').body).toEqual({ userId: 'u2' });
    act(() => socket.receive('chat:message', { message: msg('m2', 'u2', 'Player2', 'again') }));
    expect(within(dialog).queryByText('again')).toBeNull();
    expect(within(dialog).getByText(/No messages yet/)).toBeInTheDocument();
  });
});

const games = [
  {
    id: 'g1',
    mode: 'group',
    rounds: 10,
    score: 120,
    rank: 2,
    players: 4,
    endedAt: '2026-11-10T10:00:00Z',
  },
  {
    id: 'g2',
    mode: 'single',
    rounds: 5,
    score: 210,
    rank: null,
    players: 1,
    endedAt: '2026-11-09T10:00:00Z',
  },
];

describe('profile', () => {
  test('shows stats and recent games, loads more, and saves edits', async () => {
    const user = userEvent.setup();
    let page = 0;
    const server = installFakeServer(
      base({
        'GET /auth/me': () => ({
          data: {
            user: sampleUser({
              stats: { gamesPlayed: 13, groupWins: 7, uniqueAnswers: 40, groupTotalScore: 900 },
            }),
          },
        }),
        'GET /users/me/games': () => {
          page += 1;
          return {
            data:
              page === 1
                ? { games: [games[0]], nextCursor: '123' }
                : { games: [games[1]], nextCursor: null },
          };
        },
        'PATCH /users/me': () => ({
          data: { user: sampleUser({ nickname: 'Mayaa', avatarColor: '#1FA463' }) },
        }),
      }),
    );
    renderApp('/profile', { socket: createFakeSocket() });
    const stats = await screen.findByTestId('stats');
    expect(within(stats).getByText('900')).toBeInTheDocument();
    expect(within(stats).getByText('Group wins')).toBeInTheDocument();
    expect(await screen.findByText('Group of 4, 10 rounds')).toBeInTheDocument();
    expect(screen.getByText(/Place 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Solo, 5 rounds')).toBeInTheDocument();
    expect(server.calls.filter((c) => c.key === 'GET /users/me/games')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    const field = screen.getByRole('textbox', { name: 'Nickname' });
    await user.clear(field);
    await user.type(field, 'Mayaa');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(server.calls.find((c) => c.key === 'PATCH /users/me').body).toEqual({
        nickname: 'Mayaa',
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Mayaa' })).toBeInTheDocument();
  });

  test('a taken nickname shows the server message', async () => {
    const user = userEvent.setup();
    installFakeServer(
      base({
        'GET /users/me/games': () => ({ data: { games: [], nextCursor: null } }),
        'PATCH /users/me': () => ({
          status: 409,
          data: {
            error: {
              code: 'CONFLICT',
              message: 'That nickname is already in use.',
              details: [{ field: 'nickname', message: 'That nickname is already in use.' }],
            },
          },
        }),
      }),
    );
    renderApp('/profile', { socket: createFakeSocket() });
    expect(await screen.findByText('No finished games yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    const field = screen.getByRole('textbox', { name: 'Nickname' });
    await user.clear(field);
    await user.type(field, 'Taken1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already in use');
  });
});

describe('blocked players', () => {
  test('lists them and unblocks', async () => {
    const user = userEvent.setup();
    const server = installFakeServer(
      base({
        'GET /blocks': () => ({
          data: { blocks: [{ userId: 'u2', nickname: 'Player2', avatarColor: '#FFC247' }] },
        }),
        'DELETE /blocks/u2': () => ({ status: 204, data: null }),
      }),
    );
    renderApp('/profile/blocked', { socket: createFakeSocket() });
    expect(await screen.findByText('Player2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unblock Player2' }));
    expect(await screen.findByText('You have not blocked anyone.')).toBeInTheDocument();
    expect(server.calls.some((c) => c.key === 'DELETE /blocks/u2')).toBe(true);
  });
});

describe('group ranks', () => {
  test('shows wins, switches to points and pins your row when not in the list', async () => {
    const user = userEvent.setup();
    const calls = [];
    const entry = (rank, name, wins, points, over = {}) => ({
      rank,
      userId: `x${rank}`,
      nickname: name,
      avatarColor: '#FFC247',
      wins,
      points,
      games: 5,
      isYou: false,
      ...over,
    });
    installFakeServer(
      base({
        'GET /leaderboards/single': () => ({ data: { entries: [], you: null } }),
        'GET /leaderboards/group': (config) => {
          calls.push(config.params);
          return {
            data: {
              entries: [entry(1, 'Ace', 9, 400), entry(2, 'Bea', 4, 500, { isYou: false })],
              you: entry(51, 'Maya', 1, 80, { isYou: true, userId: 'u1' }),
            },
          };
        },
      }),
    );
    renderApp('/ranks', { socket: createFakeSocket() });
    await user.click(await screen.findByRole('radio', { name: 'Group' }));
    expect(await screen.findByText('Ace')).toBeInTheDocument();
    expect(calls[0]).toEqual({ metric: 'wins', limit: 50 });
    const you = screen.getByTestId('you');
    expect(within(you).getByText('51')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Points' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ metric: 'points', limit: 50 }));
  });
});
