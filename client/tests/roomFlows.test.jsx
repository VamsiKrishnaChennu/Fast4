import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setSessionHint } from '../src/api/axiosClient.js';
import { cleanCode } from '../src/components/group/CodeInput.jsx';
import { serverNow } from '../src/utils/serverClock.js';
import { createFakeSocket, sampleRoom, samplePlayer } from './helpers/fakeSocket.js';
import { apiError, installFakeServer, sampleUser } from './helpers/fakeServer.js';
import { renderApp } from './helpers/renderApp.jsx';

const base = (extra = {}) => ({
  'GET /meta/config': () => ({ data: { data: { appVersion: '1', supportEmail: 'h@e.com' } } }),
  'POST /auth/refresh': () => ({ data: { accessToken: 'tok' } }),
  'GET /auth/me': () => ({ data: { user: sampleUser({ id: 'u1', nickname: 'Maya' }) } }),
  ...extra,
});

const lobby = (players = 2, over = {}) =>
  sampleRoom({
    players: Array.from({ length: players }, (_, i) => samplePlayer(i + 1)),
    ...over,
  });

const ok = (data) => ({ ok: true, data });
const fail = (code, message, details) => ({ ok: false, error: { code, message, details } });

beforeEach(() => setSessionHint(true));
afterEach(() => vi.restoreAllMocks());

describe('code input', () => {
  test.each([
    ['k7q2mx', 'K7Q2MX'],
    [' k7q-2mx ', 'K7Q2MX'],
    ['K7Q0O1I2MX', 'K7Q2MX'],
    ['abcdefghjk', 'ABCDEF'],
    ['', ''],
  ])('%p becomes %p', (typed, expected) => {
    expect(cleanCode(typed)).toBe(expected);
  });
});

describe('create a room', () => {
  test('the steppers change the settings and the room is created with them', async () => {
    const user = userEvent.setup();
    installFakeServer(base());
    const socket = createFakeSocket({
      'room:create': () => ok({ code: 'K7Q2MX', room: lobby(1) }),
    });
    renderApp('/group', { socket });
    expect(await screen.findByTestId('players-value')).toHaveTextContent('8');
    expect(screen.getByRole('button', { name: 'More players' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Fewer players' }));
    expect(screen.getByTestId('players-value')).toHaveTextContent('7');
    for (let i = 0; i < 3; i += 1)
      await user.click(screen.getByRole('button', { name: 'Fewer rounds' }));
    expect(screen.getByTestId('rounds-value')).toHaveTextContent('7');
    await user.click(screen.getByRole('button', { name: 'Create room' }));
    expect(await screen.findByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
    expect(socket.calls('room:create')[0].payload).toEqual({
      settings: { maxPlayers: 7, rounds: 7 },
    });
    expect(screen.getByRole('img', { name: 'Room code K 7 Q 2 M X' })).toBeInTheDocument();
  });

  test('the stepper stops at the limits', async () => {
    const user = userEvent.setup();
    installFakeServer(base());
    renderApp('/group');
    const fewer = await screen.findByRole('button', { name: 'Fewer rounds' });
    for (let i = 0; i < 8; i += 1) await user.click(fewer);
    expect(screen.getByTestId('rounds-value')).toHaveTextContent('5');
    expect(fewer).toBeDisabled();
    const more = screen.getByRole('button', { name: 'More rounds' });
    for (let i = 0; i < 20; i += 1) if (!more.disabled) await user.click(more);
    expect(screen.getByTestId('rounds-value')).toHaveTextContent('20');
  });

  test('a failed create shows the message and keeps the button usable', async () => {
    const user = userEvent.setup();
    installFakeServer(base());
    const socket = createFakeSocket({
      'room:create': () => fail('INTERNAL', 'Something went wrong.'),
    });
    renderApp('/group', { socket });
    await user.click(await screen.findByRole('button', { name: 'Create room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(screen.getByRole('button', { name: 'Create room' })).toBeEnabled();
  });
});

describe('join a room', () => {
  const previewRoute = {
    'GET /rooms/K7Q2MX': () => ({
      data: {
        code: 'K7Q2MX',
        status: 'lobby',
        playerCount: 3,
        maxPlayers: 8,
        rounds: 10,
        hostNickname: 'Maya',
        players: [
          { nickname: 'Maya', avatarColor: '#2F66F5' },
          { nickname: 'Arjun', avatarColor: '#1FA463' },
          { nickname: 'Priya', avatarColor: '#E8473F' },
        ],
      },
    }),
  };

  test('typed or pasted codes are cleaned, the room is previewed, and joining opens the lobby', async () => {
    const user = userEvent.setup();
    const server = installFakeServer(base(previewRoute));
    const socket = createFakeSocket({
      'room:join': ({ code }) => ok({ room: lobby(3, { code }), rejoined: false }),
    });
    renderApp('/group?tab=join', { socket });
    const input = await screen.findByLabelText('Room code');
    const join = screen.getByRole('button', { name: 'Join room' });
    expect(join).toBeDisabled();
    await user.click(input);
    await user.paste(' k7q-2mx ');
    expect(input).toHaveValue('K7Q2MX');
    expect(await screen.findByTestId('preview')).toHaveTextContent("Maya's room");
    expect(screen.getByTestId('preview')).toHaveTextContent('10 rounds, 3 of 8 players');
    expect(server.calls.some((c) => c.key === 'GET /rooms/K7Q2MX')).toBe(true);
    await user.click(join);
    expect(await screen.findByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
    expect(socket.calls('room:join')[0].payload).toEqual({ code: 'K7Q2MX' });
  });

  test('a code with no room shows the Room not found popup', async () => {
    const user = userEvent.setup();
    installFakeServer(
      base({ 'GET /rooms/ZZZZZZ': () => apiError(404, 'ROOM_NOT_FOUND', 'Room not found.') }),
    );
    const socket = createFakeSocket({
      'room:join': () => fail('ROOM_NOT_FOUND', 'Room not found.'),
    });
    renderApp('/group?tab=join', { socket });
    await user.type(await screen.findByLabelText('Room code'), 'zzzzzz');
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Join room' }));
    const dialog = await screen.findByRole('dialog', { name: 'Room not found' });
    expect(dialog).toHaveTextContent('like K7Q2MX');
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test.each([
    ['ROOM_FULL', 'This room is full.'],
    ['ROOM_LOCKED', 'This game has already started.'],
    ['FORBIDDEN', 'You were removed from this room.'],
  ])('%s shows its own message', async (code, message) => {
    const user = userEvent.setup();
    installFakeServer(base());
    const socket = createFakeSocket({ 'room:join': () => fail(code, 'server text') });
    renderApp('/group?tab=join', { socket });
    await user.type(await screen.findByLabelText('Room code'), 'k7q2mx');
    await user.click(screen.getByRole('button', { name: 'Join room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  test('a player already in a room is offered a way back', async () => {
    installFakeServer(base());
    const socket = createFakeSocket();
    renderApp('/group', { socket });
    await screen.findByRole('button', { name: 'Create room' });
    act(() => socket.receive('room:state', lobby(2)));
    expect(await screen.findByText('You are in room K7Q2MX.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the room' })).toHaveAttribute(
      'href',
      '/room/K7Q2MX',
    );
  });
});

describe('the lobby as host', () => {
  async function openLobby({ players = 3, handlers = {} } = {}) {
    installFakeServer(base());
    const socket = createFakeSocket({
      'room:join': () => ok({ room: lobby(players), rejoined: true }),
      ...handlers,
    });
    renderApp('/room/K7Q2MX', { socket });
    await screen.findByRole('heading', { name: 'Lobby' });
    return socket;
  }

  test('shows the code, the players, who is host, and the settings', async () => {
    await openLobby();
    expect(screen.getByRole('img', { name: 'Room code K 7 Q 2 M X' })).toBeInTheDocument();
    expect(screen.getByText('Share it with friends')).toBeInTheDocument();
    expect(screen.getByTestId('player-count')).toHaveTextContent('3 of 8');
    const rows = screen.getAllByTestId('player-row');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('(you)')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Host')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('button', { name: 'Options for Arjun' })).toBeInTheDocument();
    expect(screen.getByText('10 rounds, up to 8 players')).toBeInTheDocument();
  });

  test('a disconnected player is shown as reconnecting and updates arrive from the server', async () => {
    const socket = await openLobby();
    const players = [samplePlayer(1), samplePlayer(2, { connected: false }), samplePlayer(3)];
    act(() => socket.receive('room:state', lobby(3, { players })));
    const row = screen.getAllByTestId('player-row')[1];
    expect(within(row).getByText('Reconnecting')).toBeInTheDocument();
    act(() => socket.receive('room:state', lobby(4)));
    expect(screen.getByTestId('player-count')).toHaveTextContent('4 of 8');
  });

  test('players who left are not listed', async () => {
    const socket = await openLobby();
    act(() =>
      socket.receive(
        'room:state',
        lobby(3, { players: [samplePlayer(1), samplePlayer(2, { left: true }), samplePlayer(3)] }),
      ),
    );
    expect(screen.getByTestId('player-count')).toHaveTextContent('2 of 8');
  });

  test('Start needs two connected players and says so', async () => {
    const socket = await openLobby({ players: 1 });
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled();
    expect(screen.getByText('You need at least 2 players to start.')).toBeInTheDocument();
    act(() =>
      socket.receive(
        'room:state',
        lobby(2, { players: [samplePlayer(1), samplePlayer(2, { connected: false })] }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled();
    act(() => socket.receive('room:state', lobby(2)));
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled();
  });

  test('Start sends game:start and shows the get ready screen', async () => {
    const user = userEvent.setup();
    const socket = await openLobby({
      handlers: {
        'game:start': () => ok({ room: lobby(3, { status: 'in_progress', phase: 'STARTING' }) }),
      },
    });
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(await screen.findByText('Get ready!')).toBeInTheDocument();
    expect(socket.calls('game:start')).toHaveLength(1);
  });

  test('a start the server refuses shows its message', async () => {
    const user = userEvent.setup();
    await openLobby({
      handlers: {
        'game:start': () => fail('INVALID_PHASE', 'You need at least 2 players to start.'),
      },
    });
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 2 players');
  });

  test('Edit changes the settings; the players stepper cannot go below who is there', async () => {
    const user = userEvent.setup();
    const socket = await openLobby({
      handlers: {
        'room:updateSettings': ({ settings }) => ok({ room: lobby(3, { settings }) }),
      },
    });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Room settings' });
    for (let i = 0; i < 6; i += 1) {
      const fewer = within(dialog).getByRole('button', { name: 'Fewer players' });
      if (!fewer.disabled) await user.click(fewer);
    }
    expect(within(dialog).getByTestId('players-value')).toHaveTextContent('3');
    expect(within(dialog).getByRole('button', { name: 'Fewer players' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'More rounds' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(socket.calls('room:updateSettings')[0].payload).toEqual({
      settings: { maxPlayers: 3, rounds: 11 },
    });
    expect(screen.getByText('11 rounds, up to 3 players')).toBeInTheDocument();
  });

  test('a settings error from the server appears in the dialog', async () => {
    const user = userEvent.setup();
    await openLobby({
      handlers: {
        'room:updateSettings': () =>
          fail('VALIDATION_ERROR', 'There are already more players than that.', [
            { field: 'maxPlayers', message: 'At least 3 (players in the room).' },
          ]),
      },
    });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('At least 3 (players in the room).')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('removing a player asks first, then sends room:kick', async () => {
    const user = userEvent.setup();
    const socket = await openLobby({ handlers: { 'room:kick': () => ok({}) } });
    await user.click(screen.getByRole('button', { name: 'Options for Arjun' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Arjun?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(socket.calls('room:kick')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Options for Arjun' }));
    await user.click(screen.getByRole('button', { name: 'Remove from room' }));
    await waitFor(() => expect(socket.calls('room:kick')).toHaveLength(1));
    expect(socket.calls('room:kick')[0].payload).toEqual({ userId: 'u2' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('a failed removal shows the message', async () => {
    const user = userEvent.setup();
    await openLobby({
      handlers: { 'room:kick': () => fail('NOT_FOUND', 'That player is not in the room.') },
    });
    await user.click(screen.getByRole('button', { name: 'Options for Arjun' }));
    await user.click(screen.getByRole('button', { name: 'Remove from room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not in the room');
  });

  test('Copy code copies the code and Share link uses the share sheet or copies the link', async () => {
    const user = userEvent.setup();
    await openLobby();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('K7Q2MX');
    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument());

    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/room/K7Q2MX`);
    await waitFor(() => expect(screen.getByText('Link copied')).toBeInTheDocument());

    const share = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${window.location.origin}/room/K7Q2MX` }),
    );
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  test('copying fails quietly when the browser refuses', async () => {
    const user = userEvent.setup();
    await openLobby();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
      configurable: true,
    });
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  test('the scoring sheet opens and closes', async () => {
    const user = userEvent.setup();
    await openLobby();
    await user.click(screen.getByRole('button', { name: 'How scoring works' }));
    const sheet = screen.getByRole('dialog', { name: 'How scoring works' });
    expect(within(sheet).getByText('Nobody else wrote it')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'How scoring works' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the lobby as a player', () => {
  async function openAsPlayer(handlers = {}) {
    installFakeServer(
      base({
        'GET /auth/me': () => ({ data: { user: sampleUser({ id: 'u2', nickname: 'Arjun' }) } }),
      }),
    );
    const socket = createFakeSocket({
      'room:join': () => ok({ room: lobby(3), rejoined: false }),
      ...handlers,
    });
    renderApp('/room/k7q2mx', { socket });
    await screen.findByRole('heading', { name: 'Lobby' });
    return socket;
  }

  test('shows who hosts, an avatar row, read-only settings and the waiting bar', async () => {
    await openAsPlayer();
    expect(screen.getByText('Hosted by Maya')).toBeInTheDocument();
    expect(screen.getByText('Waiting for Maya')).toBeInTheDocument();
    expect(screen.getByText('The host starts the game')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('10 rounds, up to 8 players')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy code' })).not.toBeInTheDocument();
  });

  test('Leave sends room:leave and goes home', async () => {
    const user = userEvent.setup();
    const socket = await openAsPlayer({ 'room:leave': () => ok({}) });
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Ready, Arjun?')).toBeInTheDocument();
    expect(socket.calls('room:leave')).toHaveLength(1);
  });

  test('the back arrow also leaves the room', async () => {
    const user = userEvent.setup();
    const socket = await openAsPlayer({ 'room:leave': () => fail('INTERNAL', 'x') });
    await user.click(screen.getByRole('button', { name: 'Leave room' }));
    expect(await screen.findByText('Ready, Arjun?')).toBeInTheDocument();
    expect(socket.calls('room:leave')).toHaveLength(1);
  });

  test('when the host becomes someone else the screen changes with the next snapshot', async () => {
    const socket = await openAsPlayer();
    act(() => socket.receive('room:state', lobby(3, { hostId: 'u2' })));
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText('Share it with friends')).toBeInTheDocument();
  });
});

describe('opening a room link', () => {
  test('joins the room named in the link once connected', async () => {
    installFakeServer(base());
    const socket = createFakeSocket({ 'room:join': () => ok({ room: lobby(2), rejoined: false }) });
    renderApp('/room/k7q2mx', { socket });
    expect(await screen.findByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
    expect(socket.calls('room:join')).toHaveLength(1);
    expect(socket.calls('room:join')[0].payload).toEqual({ code: 'K7Q2MX' });
  });

  test('shows a joining message while connecting', async () => {
    installFakeServer(base());
    const socket = createFakeSocket({ 'room:join': () => new Promise(() => {}) });
    renderApp('/room/K7Q2MX', { socket });
    expect(await screen.findByText('Joining the room...')).toBeInTheDocument();
  });

  test('an unknown room shows the popup and Try again goes to the join tab', async () => {
    const user = userEvent.setup();
    installFakeServer(base());
    const socket = createFakeSocket({
      'room:join': () => fail('ROOM_NOT_FOUND', 'Room not found.'),
    });
    renderApp('/room/ZZZZZZ', { socket });
    const dialog = await screen.findByRole('dialog', { name: 'Room not found' });
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Room code')).toBeInTheDocument();
  });

  test.each([
    ['ROOM_FULL', 'This room is full.'],
    ['ROOM_LOCKED', 'This game has already started.'],
    ['FORBIDDEN', 'You were removed from this room.'],
    ['INTERNAL', 'Something went wrong. Please try again.'],
  ])('%s explains why the room cannot be joined', async (code, message) => {
    const user = userEvent.setup();
    installFakeServer(base());
    const socket = createFakeSocket({ 'room:join': () => fail(code, 'x') });
    renderApp('/room/K7Q2MX', { socket });
    const dialog = await screen.findByRole('dialog', { name: "Can't join this room" });
    expect(dialog).toHaveTextContent(message);
    await user.click(within(dialog).getByRole('button', { name: 'Back to home' }));
    expect(await screen.findByRole('button', { name: 'Create room' })).toBeInTheDocument();
  });

  test('a signed-out visitor logs in first and then lands in the room', async () => {
    setSessionHint(false);
    const user = userEvent.setup();
    installFakeServer(
      base({
        'POST /auth/login': () => ({
          data: { user: sampleUser({ id: 'u1', nickname: 'Maya' }), accessToken: 'tok' },
        }),
      }),
    );
    const socket = createFakeSocket({ 'room:join': () => ok({ room: lobby(2), rejoined: false }) });
    renderApp('/room/K7Q2MX', { socket });
    await user.type(await screen.findByLabelText('Email or phone'), 'maya@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Test1234');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
  });
});

describe('being removed or disconnected', () => {
  async function inLobby() {
    installFakeServer(
      base({
        'GET /auth/me': () => ({ data: { user: sampleUser({ id: 'u2', nickname: 'Arjun' }) } }),
      }),
    );
    const socket = createFakeSocket({ 'room:join': () => ok({ room: lobby(3), rejoined: false }) });
    renderApp('/room/K7Q2MX', { socket });
    await screen.findByRole('heading', { name: 'Lobby' });
    return socket;
  }

  test('removed by the host: a popup names the host and sends the player home', async () => {
    const user = userEvent.setup();
    const socket = await inLobby();
    act(() => socket.receive('room:kicked', { reason: 'removed' }));
    const dialog = await screen.findByRole('dialog', { name: 'You were removed' });
    expect(dialog).toHaveTextContent("The host removed you from Maya's room.");
    await user.click(within(dialog).getByRole('button', { name: 'Back to home' }));
    expect(await screen.findByText('Ready, Arjun?')).toBeInTheDocument();
  });

  test('opened somewhere else: the old tab is told', async () => {
    const socket = await inLobby();
    act(() => socket.receive('room:kicked', { reason: 'takeover' }));
    expect(
      await screen.findByRole('dialog', { name: 'Opened somewhere else' }),
    ).toBeInTheDocument();
  });

  test('a room closed for being idle is explained', async () => {
    const socket = await inLobby();
    act(() => socket.receive('error:notice', { code: 'ROOM_CLOSED', message: 'x' }));
    expect(await screen.findByRole('dialog', { name: 'Room closed' })).toBeInTheDocument();
  });

  test('other notices are ignored', async () => {
    const socket = await inLobby();
    act(() => socket.receive('error:notice', { code: 'SERVER_RESTARTING', message: 'x' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('a dropped connection shows the reconnecting banner until it comes back', async () => {
    const socket = await inLobby();
    expect(screen.queryByText('Reconnecting...')).not.toBeInTheDocument();
    act(() => socket.drop());
    expect(await screen.findByText('Reconnecting...')).toBeInTheDocument();
    expect(screen.getByText('Your seat is saved for one minute.')).toBeInTheDocument();
    act(() => socket.open());
    await waitFor(() => expect(screen.queryByText('Reconnecting...')).not.toBeInTheDocument());
  });
});

describe('the connection', () => {
  test('an expired token is refreshed and the connection retried', async () => {
    const server = installFakeServer(base());
    const socket = createFakeSocket();
    const connect = vi.spyOn(socket, 'connect');
    renderApp('/group', { socket });
    await screen.findByRole('button', { name: 'Create room' });
    act(() =>
      socket.receive(
        'connect_error',
        Object.assign(new Error('x'), { data: { code: 'TOKEN_EXPIRED' } }),
      ),
    );
    await waitFor(() => expect(connect).toHaveBeenCalled());
    expect(
      server.calls.filter((c) => c.key === 'POST /auth/refresh').length,
    ).toBeGreaterThanOrEqual(2);
  });

  test('other connection errors only show the banner', async () => {
    installFakeServer(base());
    const socket = createFakeSocket();
    const connect = vi.spyOn(socket, 'connect');
    renderApp('/group', { socket });
    await screen.findByRole('button', { name: 'Create room' });
    act(() => socket.receive('connect_error', new Error('offline')));
    expect(await screen.findByText('Reconnecting...')).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
  });

  test('the server time offset is taken from three time:sync answers', async () => {
    installFakeServer(base());
    const socket = createFakeSocket({ 'time:sync': () => ok({ serverNow: Date.now() + 5000 }) });
    renderApp('/group', { socket });
    await waitFor(() => expect(socket.calls('time:sync')).toHaveLength(3));
    await waitFor(() => expect(Math.abs(serverNow() - Date.now() - 5000)).toBeLessThan(500));
  });

  test('a request with no answer in time fails with a clear message', async () => {
    const user = userEvent.setup();
    installFakeServer(base());
    const socket = createFakeSocket();
    socket.timeout = () => ({ emit: (event, payload, cb) => cb(new Error('timeout')) });
    renderApp('/group', { socket });
    await user.click(await screen.findByRole('button', { name: 'Create room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('took too long');
  });
});
