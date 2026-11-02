import { jest } from '@jest/globals';
import { createRoomManager } from '../../src/services/roomManager.js';
import { createFakeTimers } from '../helpers/realtimeHelpers.js';

const user = (n) => ({ id: `u${n}`, nickname: `Player${n}`, avatarColor: '#FFC247' });

function setup(over = {}) {
  const clock = createFakeTimers();
  const sent = { room: [], socket: [], join: [], leave: [] };
  const changes = [];
  const closed = [];
  let counter = 0;
  const manager = createRoomManager({
    clock,
    // Codes come out as AAAAAA, AAAAAB, ... so tests can predict them.
    randomInt: (max) => {
      const n = counter;
      counter += 1;
      return n % max;
    },
    notify: {
      room: (code, event, payload) => sent.room.push({ code, event, payload }),
      socket: (id, event, payload) => sent.socket.push({ id, event, payload }),
      join: (id, code) => sent.join.push({ id, code }),
      leave: (id, code) => sent.leave.push({ id, code }),
    },
    onChange: (snapshot) => changes.push(snapshot),
    onClose: (code) => closed.push(code),
    ...over,
  });
  const events = (name) => sent.room.filter((e) => e.event === name);
  return { manager, clock, sent, changes, closed, events };
}

const make = (ctx, n = 1, settings) =>
  ctx.manager.create({ user: user(n), socketId: `s${n}`, settings });
const codeOf = (room) => room.code;

describe('create', () => {
  test('makes a lobby with the caller as host and the default settings', () => {
    const ctx = setup();
    const room = make(ctx);
    expect(room).toMatchObject({
      status: 'lobby',
      phase: 'LOBBY',
      hostId: 'u1',
      settings: { maxPlayers: 8, rounds: 10 },
    });
    expect(room.code).toHaveLength(6);
    expect(room.players).toHaveLength(1);
    expect(room.players[0]).toMatchObject({ userId: 'u1', nickname: 'Player1', connected: true });
    expect(ctx.sent.join).toEqual([{ id: 's1', code: room.code }]);
    expect(ctx.changes.at(-1)).toMatchObject({ code: room.code, hostId: 'u1' });
  });

  test('keeps the settings it is given', () => {
    const ctx = setup();
    const room = make(ctx, 1, { maxPlayers: 3, rounds: 7 });
    expect(room.settings).toEqual({ maxPlayers: 3, rounds: 7 });
  });

  test('retries when a generated code is taken', () => {
    const ctx = setup({ randomInt: () => 0 });
    make(ctx, 1);
    expect(() => make(ctx, 2)).toThrow(/Could not make a room code/);
  });

  test('a player who creates a second room leaves the first', () => {
    const ctx = setup();
    const first = make(ctx, 1);
    ctx.manager.join({ code: first.code, user: user(2), socketId: 's2' });
    const second = ctx.manager.create({ user: user(2), socketId: 's2' });
    expect(second.code).not.toBe(first.code);
    expect(ctx.manager.findByUser('u2').code).toBe(second.code);
    expect(ctx.manager.preview(first.code).playerCount).toBe(1);
  });
});

describe('join', () => {
  test('adds the player and tells everyone', () => {
    const ctx = setup();
    const room = make(ctx);
    const { room: joined, rejoined } = ctx.manager.join({
      code: room.code,
      user: user(2),
      socketId: 's2',
    });
    expect(rejoined).toBe(false);
    expect(joined.players.map((p) => p.userId)).toEqual(['u1', 'u2']);
    expect(ctx.events('room:playerJoined')[0].payload.player.userId).toBe('u2');
    expect(ctx.events('room:state').at(-1).payload.players).toHaveLength(2);
    expect(ctx.sent.join).toContainEqual({ id: 's2', code: room.code });
  });

  test('accepts a code typed in lower case with spaces', () => {
    const ctx = setup();
    const room = make(ctx);
    const typed = ` ${room.code.toLowerCase().slice(0, 3)} ${room.code.toLowerCase().slice(3)} `;
    expect(ctx.manager.join({ code: typed, user: user(2), socketId: 's2' }).room.code).toBe(
      room.code,
    );
  });

  test.each(['', 'ZZZZZZ', 'nope', 'K7Q2M0', null])('%p is ROOM_NOT_FOUND', (code) => {
    const ctx = setup();
    make(ctx);
    expect(() => ctx.manager.join({ code, user: user(2), socketId: 's2' })).toThrow(
      expect.objectContaining({ code: 'ROOM_NOT_FOUND', status: 404 }),
    );
  });

  test('a full room refuses with ROOM_FULL', () => {
    const ctx = setup();
    const room = make(ctx, 1, { maxPlayers: 2, rounds: 10 });
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    expect(() => ctx.manager.join({ code: room.code, user: user(3), socketId: 's3' })).toThrow(
      expect.objectContaining({ code: 'ROOM_FULL' }),
    );
  });

  test('a room that started refuses newcomers with ROOM_LOCKED', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.start({ userId: 'u1' });
    expect(() => ctx.manager.join({ code: room.code, user: user(3), socketId: 's3' })).toThrow(
      expect.objectContaining({ code: 'ROOM_LOCKED' }),
    );
  });

  test('a player already in the room is rebound, not added twice', () => {
    const ctx = setup();
    const room = make(ctx);
    const again = ctx.manager.join({ code: room.code, user: user(1), socketId: 's1' });
    expect(again.rejoined).toBe(true);
    expect(again.room.players).toHaveLength(1);
  });

  test('a second tab takes over and the first is told', () => {
    const ctx = setup();
    const room = make(ctx);
    const again = ctx.manager.join({ code: room.code, user: user(1), socketId: 's1b' });
    expect(again.room.players).toHaveLength(1);
    expect(ctx.sent.socket).toContainEqual({
      id: 's1',
      event: 'room:kicked',
      payload: { reason: 'takeover' },
    });
    expect(ctx.sent.leave).toContainEqual({ id: 's1', code: room.code });
    // the old tab closing later must not mark the player as disconnected
    ctx.manager.disconnect({ userId: 'u1', socketId: 's1' });
    expect(ctx.manager.findByUser('u1').players[0].connected).toBe(true);
  });

  test('a player in another room leaves it when joining this one', () => {
    const ctx = setup();
    const a = make(ctx, 1);
    const b = make(ctx, 2);
    ctx.manager.join({ code: a.code, user: user(3), socketId: 's3' });
    ctx.manager.join({ code: b.code, user: user(3), socketId: 's3' });
    expect(ctx.manager.preview(a.code).playerCount).toBe(1);
    expect(ctx.manager.preview(b.code).playerCount).toBe(2);
  });

  test('a failed join does not remove the player from their current room', () => {
    const ctx = setup();
    const a = make(ctx, 1);
    const full = make(ctx, 2, { maxPlayers: 2, rounds: 5 });
    ctx.manager.join({ code: full.code, user: user(4), socketId: 's4' });
    ctx.manager.join({ code: a.code, user: user(3), socketId: 's3' });
    expect(() => ctx.manager.join({ code: full.code, user: user(3), socketId: 's3' })).toThrow();
    expect(ctx.manager.findByUser('u3').code).toBe(a.code);
  });
});

describe('leave and host transfer', () => {
  test('a player leaving is announced and removed', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.leave({ userId: 'u2' });
    expect(ctx.events('room:playerLeft')[0].payload.player.userId).toBe('u2');
    expect(ctx.manager.preview(room.code).playerCount).toBe(1);
    expect(ctx.manager.findByUser('u2')).toBeNull();
    expect(ctx.sent.leave).toContainEqual({ id: 's2', code: room.code });
  });

  test('leaving when not in a room does nothing', () => {
    const ctx = setup();
    expect(() => ctx.manager.leave({ userId: 'nobody' })).not.toThrow();
  });

  test('when the host leaves, the longest connected player becomes host', () => {
    const ctx = setup();
    const room = make(ctx, 1);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.clock.advance(5000);
    ctx.manager.join({ code: room.code, user: user(3), socketId: 's3' });
    ctx.manager.leave({ userId: 'u1' });
    expect(ctx.events('room:hostChanged').at(-1).payload).toEqual({ hostId: 'u2' });
    expect(ctx.manager.findByUser('u2').hostId).toBe('u2');
  });

  test('host transfer skips disconnected players when someone is connected', () => {
    const ctx = setup();
    const room = make(ctx, 1);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.join({ code: room.code, user: user(3), socketId: 's3' });
    ctx.manager.disconnect({ userId: 'u2', socketId: 's2' });
    ctx.manager.leave({ userId: 'u1' });
    expect(ctx.manager.findByUser('u3').hostId).toBe('u3');
  });

  test('host transfer picks a disconnected player when nobody is connected', () => {
    const ctx = setup();
    const room = make(ctx, 1);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.disconnect({ userId: 'u2', socketId: 's2' });
    ctx.manager.leave({ userId: 'u1' });
    expect(ctx.manager.findByUser('u2').hostId).toBe('u2');
  });

  test('the last player leaving removes the room', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.leave({ userId: 'u1' });
    expect(ctx.manager.size()).toBe(0);
    expect(ctx.closed).toEqual([room.code]);
    expect(() => ctx.manager.preview(room.code)).toThrow(
      expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
    );
  });
});

describe('settings', () => {
  test('the host changes them and everyone is told', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    const updated = ctx.manager.updateSettings({
      userId: 'u1',
      settings: { maxPlayers: 4, rounds: 15 },
    });
    expect(updated.settings).toEqual({ maxPlayers: 4, rounds: 15 });
    expect(ctx.events('room:settingsUpdated').at(-1).payload).toEqual({
      settings: { maxPlayers: 4, rounds: 15 },
    });
  });

  test('only the host may change them', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    expect(() =>
      ctx.manager.updateSettings({ userId: 'u2', settings: { maxPlayers: 4, rounds: 5 } }),
    ).toThrow(expect.objectContaining({ code: 'NOT_HOST' }));
  });

  test('maxPlayers cannot go below the current player count', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.join({ code: room.code, user: user(3), socketId: 's3' });
    expect(() =>
      ctx.manager.updateSettings({ userId: 'u1', settings: { maxPlayers: 2, rounds: 5 } }),
    ).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: [expect.objectContaining({ field: 'maxPlayers' })],
      }),
    );
    expect(() =>
      ctx.manager.updateSettings({ userId: 'u1', settings: { maxPlayers: 3, rounds: 5 } }),
    ).not.toThrow();
  });

  test('not allowed after the game started, and not for someone outside a room', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.start({ userId: 'u1' });
    expect(() =>
      ctx.manager.updateSettings({ userId: 'u1', settings: { maxPlayers: 8, rounds: 5 } }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_PHASE' }));
    expect(() =>
      ctx.manager.updateSettings({ userId: 'stranger', settings: { maxPlayers: 8, rounds: 5 } }),
    ).toThrow(expect.objectContaining({ code: 'ROOM_NOT_FOUND' }));
  });
});

describe('kick', () => {
  test('removes the player, tells them, and they cannot return', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.kick({ userId: 'u1', targetId: 'u2' });
    expect(ctx.sent.socket).toContainEqual({
      id: 's2',
      event: 'room:kicked',
      payload: { reason: 'removed' },
    });
    expect(ctx.manager.preview(room.code).playerCount).toBe(1);
    expect(() => ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' })).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  test('host only, lobby only, not yourself, only players who are there', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.join({ code: room.code, user: user(3), socketId: 's3' });
    expect(() => ctx.manager.kick({ userId: 'u2', targetId: 'u3' })).toThrow(
      expect.objectContaining({ code: 'NOT_HOST' }),
    );
    expect(() => ctx.manager.kick({ userId: 'u1', targetId: 'u1' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
    expect(() => ctx.manager.kick({ userId: 'u1', targetId: 'ghost' })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(() => ctx.manager.kick({ userId: 'nobody', targetId: 'u2' })).toThrow(
      expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
    );
    ctx.manager.start({ userId: 'u1' });
    expect(() => ctx.manager.kick({ userId: 'u1', targetId: 'u2' })).toThrow(
      expect.objectContaining({ code: 'INVALID_PHASE' }),
    );
  });

  test('kicking a disconnected player works too', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.disconnect({ userId: 'u2', socketId: 's2' });
    ctx.manager.kick({ userId: 'u1', targetId: 'u2' });
    expect(ctx.manager.preview(room.code).playerCount).toBe(1);
  });
});

describe('start', () => {
  test('needs the host and at least two connected players', () => {
    const ctx = setup();
    const room = make(ctx);
    expect(() => ctx.manager.start({ userId: 'u1' })).toThrow(
      expect.objectContaining({
        code: 'INVALID_PHASE',
        message: expect.stringMatching(/at least 2/),
      }),
    );
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    expect(() => ctx.manager.start({ userId: 'u2' })).toThrow(
      expect.objectContaining({ code: 'NOT_HOST' }),
    );
    ctx.manager.disconnect({ userId: 'u2', socketId: 's2' });
    expect(() => ctx.manager.start({ userId: 'u1' })).toThrow(
      expect.objectContaining({ code: 'INVALID_PHASE' }),
    );
    expect(() => ctx.manager.start({ userId: 'ghost' })).toThrow(
      expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
    );
  });

  test('locks the room and announces the game', () => {
    const ctx = setup();
    const room = make(ctx, 1, { maxPlayers: 8, rounds: 7 });
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    const started = ctx.manager.start({ userId: 'u1' });
    expect(started).toMatchObject({ status: 'in_progress', phase: 'STARTING' });
    expect(ctx.events('game:started')[0].payload).toEqual({ totalRounds: 7 });
    expect(() => ctx.manager.start({ userId: 'u1' })).toThrow(
      expect.objectContaining({ code: 'INVALID_PHASE' }),
    );
  });
});

describe('disconnects and the grace period', () => {
  test('a dropped player is shown as disconnected and keeps the seat', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.disconnect({ userId: 'u2', socketId: 's2' });
    expect(ctx.events('room:playerDisconnected')[0].payload).toEqual({ userId: 'u2' });
    expect(ctx.manager.findByUser('u1').players.find((p) => p.userId === 'u2').connected).toBe(
      false,
    );
    ctx.clock.advance(59_000);
    expect(ctx.manager.preview(room.code).playerCount).toBe(2);
  });

  test('after the grace period the player leaves', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.disconnect({ userId: 'u2', socketId: 's2' });
    ctx.clock.advance(60_000);
    expect(ctx.manager.preview(room.code).playerCount).toBe(1);
    expect(ctx.events('room:playerLeft')[0].payload.player.userId).toBe('u2');
  });

  test('coming back in time restores the seat and cancels the timer', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.disconnect({ userId: 'u2', socketId: 's2' });
    ctx.clock.advance(30_000);
    const back = ctx.manager.join({ code: room.code, user: user(2), socketId: 's2b' });
    expect(back.rejoined).toBe(true);
    expect(ctx.events('room:playerReconnected')[0].payload).toEqual({ userId: 'u2' });
    expect(ctx.clock.pending()).toBe(0);
    ctx.clock.advance(120_000);
    expect(ctx.manager.preview(room.code).playerCount).toBe(2);
  });

  test('a disconnected host loses the role after the grace period', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.clock.advance(1000);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.disconnect({ userId: 'u1', socketId: 's1' });
    expect(ctx.manager.findByUser('u2').hostId).toBe('u1');
    ctx.clock.advance(60_000);
    expect(ctx.manager.findByUser('u2').hostId).toBe('u2');
    expect(ctx.events('room:hostChanged').at(-1).payload).toEqual({ hostId: 'u2' });
  });

  test('a room whose only player drops disappears after the grace period', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.disconnect({ userId: 'u1', socketId: 's1' });
    ctx.clock.advance(60_000);
    expect(ctx.manager.size()).toBe(0);
    expect(ctx.closed).toEqual([room.code]);
  });

  test('disconnect for an unknown player or a stale socket is ignored', () => {
    const ctx = setup();
    make(ctx);
    expect(() => ctx.manager.disconnect({ userId: 'ghost', socketId: 'x' })).not.toThrow();
    ctx.manager.disconnect({ userId: 'u1', socketId: 'old-socket' });
    expect(ctx.manager.findByUser('u1').players[0].connected).toBe(true);
  });

  test('a timer that fires after the player already left does nothing', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.disconnect({ userId: 'u2', socketId: 's2' });
    ctx.manager.leave({ userId: 'u2' });
    expect(() => ctx.clock.advance(61_000)).not.toThrow();
  });
});

describe('idle rooms and previews', () => {
  test('after the game started, a player who stays away is marked as left and keeps their place', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.start({ userId: 'u1' });
    ctx.manager.disconnect({ userId: 'u2', socketId: 's2' });
    ctx.clock.advance(60_000);
    const state = ctx.manager.findByUser('u1');
    expect(state.players.find((p) => p.userId === 'u2')).toMatchObject({
      left: true,
      connected: false,
    });
    expect(ctx.events('room:playerLeft')[0].payload.player.userId).toBe('u2');
    expect(ctx.manager.findByUser('u2')).toBeNull();
    expect(() => ctx.manager.join({ code: room.code, user: user(2), socketId: 's2b' })).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  test('after the game started, leaving on purpose marks the player as left and passes on the host role', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.start({ userId: 'u1' });
    ctx.manager.leave({ userId: 'u1' });
    const state = ctx.manager.findByUser('u2');
    expect(state.hostId).toBe('u2');
    expect(state.players.find((p) => p.userId === 'u1').left).toBe(true);
    ctx.manager.leave({ userId: 'u1' }); // leaving twice is harmless
  });

  test('a started room whose players all left is removed', () => {
    const ctx = setup();
    const room = make(ctx);
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    ctx.manager.start({ userId: 'u1' });
    ctx.manager.leave({ userId: 'u1' });
    ctx.manager.leave({ userId: 'u2' });
    expect(ctx.manager.size()).toBe(0);
    expect(ctx.closed).toEqual([room.code]);
  });

  test('sweepIdle closes a room after 30 quiet minutes, tells the players, and keeps active rooms', () => {
    const ctx = setup();
    const quiet = make(ctx, 1);
    const busy = make(ctx, 2);
    ctx.clock.advance(29 * 60_000);
    ctx.manager.sweepIdle();
    expect(ctx.manager.size()).toBe(2);
    // activity in one room only
    ctx.manager.join({ code: busy.code, user: user(3), socketId: 's3' });
    ctx.clock.advance(2 * 60_000);
    ctx.manager.sweepIdle();
    expect(() => ctx.manager.preview(quiet.code)).toThrow(
      expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
    );
    expect(ctx.manager.preview(busy.code).playerCount).toBe(2);
    expect(ctx.events('error:notice')).toEqual([
      expect.objectContaining({
        code: quiet.code,
        payload: expect.objectContaining({ code: 'ROOM_CLOSED' }),
      }),
    ]);
    expect(ctx.sent.leave).toContainEqual({ id: 's1', code: quiet.code });
    expect(ctx.closed).toContain(quiet.code);
    expect(ctx.manager.findByUser('u1')).toBeNull();
  });

  test('preview describes the room for the join screen', () => {
    const ctx = setup();
    const room = make(ctx, 1, { maxPlayers: 6, rounds: 12 });
    ctx.manager.join({ code: room.code, user: user(2), socketId: 's2' });
    expect(ctx.manager.preview(room.code.toLowerCase())).toEqual({
      code: room.code,
      status: 'lobby',
      playerCount: 2,
      maxPlayers: 6,
      rounds: 12,
      hostNickname: 'Player1',
      players: [
        { nickname: 'Player1', avatarColor: '#FFC247' },
        { nickname: 'Player2', avatarColor: '#FFC247' },
      ],
    });
  });

  test('works without a notifier and without persistence callbacks', () => {
    const manager = createRoomManager({ randomInt: () => 1 });
    const room = manager.create({ user: user(1), socketId: 's1' });
    manager.join({ code: room.code, user: user(2), socketId: 's2' });
    manager.setNotify({});
    manager.leave({ userId: 'u2' });
    manager.leave({ userId: 'u1' });
    expect(manager.size()).toBe(0);
    expect(jest.isMockFunction(manager.size)).toBe(false);
    expect(codeOf(room)).toHaveLength(6);
  });
});
