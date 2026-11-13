import { randomInt as cryptoRandomInt } from 'node:crypto';
import {
  LIMITS,
  isRoomCodeFormat,
  makeRoomCode,
  normalizeRoomCode,
  ROOM_DEFAULTS,
} from '@fastfour/shared';
import { AppError } from '../utils/AppError.js';
import { createGameEngine } from './gameEngine.js';

const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

const noop = () => {};

/**
 * Every live room, held in memory. All rules about who may join, leave, change settings or start
 * live here and need no network, so they can be tested directly. What the players see is sent
 * through `notify`; the socket layer provides it.
 *
 * @param {object} [deps]
 * @param {{ now: () => number, setTimeout: Function, clearTimeout: Function }} [deps.clock]
 * @param {(max: number) => number} [deps.randomInt]
 * @param {object} [deps.notify]
 * @param {(code: string, event: string, payload: object) => void} [deps.notify.room] to everyone in a room
 * @param {(socketId: string, event: string, payload: object) => void} [deps.notify.socket] to one socket
 * @param {(socketId: string, code: string) => void} [deps.notify.join] puts a socket into a room's channel
 * @param {(socketId: string, code: string) => void} [deps.notify.leave] takes it out again
 * @param {(snapshot: object) => void} [deps.onChange] called after every change worth saving
 * @param {(code: string) => void} [deps.onClose] called when a room is removed
 * @param {{ validation: object, store: object, pickLetter: Function, timing?: object, logger?: object }} [deps.game]
 *   what the game engine needs; without it a started room stays in the STARTING phase
 */
export function createRoomManager({
  clock = realClock,
  randomInt = cryptoRandomInt,
  notify = {},
  onChange = noop,
  onClose = noop,
  game = null,
} = {}) {
  let channels = { room: noop, socket: noop, join: noop, leave: noop, ...notify };
  const toRoom = (...args) => channels.room(...args);
  const toSocket = (...args) => channels.socket(...args);
  const join = (...args) => channels.join(...args);
  const leave = (...args) => channels.leave(...args);

  /** Connects the manager to the socket layer (done after the HTTP server exists). */
  function setNotify(next) {
    channels = { room: noop, socket: noop, join: noop, leave: noop, ...next };
  }
  /** @type {Map<string, object>} */
  const rooms = new Map();
  /** @type {Map<string, string>} userId -> room code */
  const byUser = new Map();

  const publicPlayer = (p) => ({
    userId: p.userId,
    nickname: p.nickname,
    avatarColor: p.avatarColor,
    joinedAt: new Date(p.joinedAt).toISOString(),
    connected: p.connected,
    left: p.left,
    score: p.score,
  });

  /** What a player's screen needs to draw the room. `userId` adds that player's own draft. */
  function snapshot(room, userId) {
    return {
      code: room.code,
      status: room.status,
      phase: room.phase,
      settings: { ...room.settings },
      players: [...room.players.values()].map(publicPlayer),
      hostId: room.hostId,
      standings: [],
      openChallenges: [],
      ...(room.engine ? room.engine.state(userId) : {}),
    };
  }

  /** What the database copy needs. */
  function persistable(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      settings: { ...room.settings },
      players: [...room.players.values()].map((p) => ({
        userId: p.userId,
        nickname: p.nickname,
        avatarColor: p.avatarColor,
        joinedAt: new Date(p.joinedAt),
        connected: p.connected,
        score: p.score,
      })),
    };
  }

  const touch = (room) => {
    room.lastActivity = clock.now();
    onChange(persistable(room));
  };
  /**
   * Sends the room state. In the lobby everyone gets the same copy; during a game each player gets
   * their own (it carries their draft and whether they pressed Done).
   */
  const sendState = (room) => {
    if (!room.engine) {
      toRoom(room.code, 'room:state', snapshot(room));
      return;
    }
    for (const p of room.players.values()) {
      if (p.socketId) toSocket(p.socketId, 'room:state', snapshot(room, p.userId));
    }
  };

  function requireRoom(code) {
    const room = rooms.get(normalizeRoomCode(code));
    if (!room) throw new AppError('ROOM_NOT_FOUND', 'Room not found.');
    return room;
  }

  function requireHost(room, userId) {
    if (room.hostId !== userId) throw new AppError('NOT_HOST', 'Only the host can do that.');
  }

  function requireLobby(room) {
    if (room.phase !== 'LOBBY') {
      throw new AppError('INVALID_PHASE', 'That can only be done in the lobby.');
    }
  }

  /** The connected player who has been connected the longest, or any player when none is. */
  function nextHost(room) {
    const players = [...room.players.values()].filter((p) => !p.left);
    const connected = players.filter((p) => p.connected);
    const pool = connected.length > 0 ? connected : players;
    return pool.reduce((best, p) => (p.connectedSince < best.connectedSince ? p : best), pool[0]);
  }

  function dropRoom(room) {
    room.engine?.dispose();
    for (const p of room.players.values()) {
      if (p.graceTimer) clock.clearTimeout(p.graceTimer);
      if (byUser.get(p.userId) === room.code) byUser.delete(p.userId);
    }
    rooms.delete(room.code);
    onClose(room.code);
  }

  /** Removes a player. Passes the host role on and closes the room when it is empty. */
  function removePlayer(room, userId) {
    const player = room.players.get(userId);
    if (!player) return;
    if (player.graceTimer) clock.clearTimeout(player.graceTimer);
    room.players.delete(userId);
    if (byUser.get(userId) === room.code) byUser.delete(userId);
    if (player.socketId) leave(player.socketId, room.code);
    if (room.players.size === 0) {
      dropRoom(room);
      return;
    }
    toRoom(room.code, 'room:playerLeft', { player: publicPlayer(player) });
    if (room.hostId === userId) {
      room.hostId = nextHost(room).userId;
      toRoom(room.code, 'room:hostChanged', { hostId: room.hostId });
    }
    touch(room);
    sendState(room);
  }

  /**
   * After the lobby a player who goes away keeps their place in the standings: they are marked
   * as having left, cannot come back, and the room closes when nobody is left.
   */
  function markLeft(room, userId) {
    const player = room.players.get(userId);
    if (!player || player.left) return;
    if (player.graceTimer) clock.clearTimeout(player.graceTimer);
    player.graceTimer = null;
    player.left = true;
    player.connected = false;
    if (player.socketId) leave(player.socketId, room.code);
    player.socketId = null;
    if (byUser.get(userId) === room.code) byUser.delete(userId);
    if ([...room.players.values()].every((p) => p.left)) {
      dropRoom(room);
      return;
    }
    toRoom(room.code, 'room:playerLeft', { player: publicPlayer(player) });
    if (room.hostId === userId) {
      room.hostId = nextHost(room).userId;
      toRoom(room.code, 'room:hostChanged', { hostId: room.hostId });
    }
    touch(room);
    room.engine?.playersChanged();
    sendState(room);
  }

  /** Lobby: the player is removed. Later: the player is marked as left. */
  const retire = (room, userId) =>
    room.phase === 'LOBBY' ? removePlayer(room, userId) : markLeft(room, userId);

  function newCode() {
    for (let i = 0; i < 20; i += 1) {
      const code = makeRoomCode(randomInt);
      if (!rooms.has(code)) return code;
    }
    throw new AppError('INTERNAL', 'Could not make a room code.');
  }

  function leaveOtherRoom(userId, exceptCode) {
    const code = byUser.get(userId);
    if (!code || code === exceptCode) return;
    const other = rooms.get(code);
    if (other) removePlayer(other, userId);
  }

  function addPlayer(room, user, socketId) {
    const now = clock.now();
    const player = {
      userId: user.id,
      nickname: user.nickname,
      avatarColor: user.avatarColor,
      joinedAt: now,
      connected: true,
      left: false,
      connectedSince: now,
      socketId,
      score: 0,
      graceTimer: null,
    };
    room.players.set(user.id, player);
    byUser.set(user.id, room.code);
    join(socketId, room.code);
    return player;
  }

  /**
   * @param {{ user: { id: string, nickname: string, avatarColor?: string }, settings?: object, socketId: string }} input
   * @returns {object} the room snapshot; the caller is the host
   */
  function create({ user, settings = ROOM_DEFAULTS, socketId }) {
    leaveOtherRoom(user.id);
    const now = clock.now();
    const room = {
      code: newCode(),
      hostId: user.id,
      status: 'lobby',
      phase: 'LOBBY',
      settings: { ...settings },
      players: new Map(),
      kicked: new Set(),
      createdAt: now,
      lastActivity: now,
    };
    rooms.set(room.code, room);
    addPlayer(room, user, socketId);
    touch(room);
    return snapshot(room);
  }

  /**
   * Joins a room, or takes the seat back when the player is already in it.
   * @returns {{ room: object, rejoined: boolean }} room is a snapshot
   */
  function joinRoom({ code, user, socketId }) {
    const normalized = normalizeRoomCode(code);
    if (!isRoomCodeFormat(normalized)) throw new AppError('ROOM_NOT_FOUND', 'Room not found.');
    const room = requireRoom(normalized);
    const existing = room.players.get(user.id);

    if (existing?.left) throw new AppError('FORBIDDEN', 'You left this game.');
    if (existing) {
      if (existing.socketId && existing.socketId !== socketId && existing.connected) {
        // The same person opened a second tab: the new one takes over.
        toSocket(existing.socketId, 'room:kicked', { reason: 'takeover' });
        leave(existing.socketId, room.code);
      }
      if (existing.graceTimer) clock.clearTimeout(existing.graceTimer);
      const wasConnected = existing.connected;
      existing.graceTimer = null;
      existing.connected = true;
      existing.connectedSince = wasConnected ? existing.connectedSince : clock.now();
      existing.socketId = socketId;
      join(socketId, room.code);
      if (!wasConnected) toRoom(room.code, 'room:playerReconnected', { userId: user.id });
      touch(room);
      room.engine?.playersChanged();
      sendState(room);
      return { room: snapshot(room, user.id), rejoined: true };
    }

    if (room.kicked.has(user.id)) {
      throw new AppError('FORBIDDEN', 'You were removed from this room.');
    }
    if (room.phase !== 'LOBBY') throw new AppError('ROOM_LOCKED', 'This game has already started.');
    if (room.players.size >= room.settings.maxPlayers) {
      throw new AppError('ROOM_FULL', 'This room is full.');
    }
    leaveOtherRoom(user.id, room.code);
    const player = addPlayer(room, user, socketId);
    toRoom(room.code, 'room:playerJoined', { player: publicPlayer(player) });
    touch(room);
    sendState(room);
    return { room: snapshot(room), rejoined: false };
  }

  /** A player leaves on purpose. */
  function leaveRoom({ userId }) {
    const code = byUser.get(userId);
    const room = code && rooms.get(code);
    if (!room) return;
    retire(room, userId);
  }

  /** @throws {AppError} NOT_HOST, INVALID_PHASE, or VALIDATION_ERROR when maxPlayers is below the player count */
  function updateSettings({ userId, settings }) {
    const room = rooms.get(byUser.get(userId));
    if (!room) throw new AppError('ROOM_NOT_FOUND', 'You are not in a room.');
    requireHost(room, userId);
    requireLobby(room);
    if (settings.maxPlayers < room.players.size) {
      throw new AppError('VALIDATION_ERROR', 'There are already more players than that.', [
        { field: 'maxPlayers', message: `At least ${room.players.size} (players in the room).` },
      ]);
    }
    room.settings = { ...settings };
    toRoom(room.code, 'room:settingsUpdated', { settings: { ...room.settings } });
    touch(room);
    sendState(room);
    return snapshot(room);
  }

  /** The host removes a player. That player cannot come back to this room. */
  function kick({ userId, targetId }) {
    const room = rooms.get(byUser.get(userId));
    if (!room) throw new AppError('ROOM_NOT_FOUND', 'You are not in a room.');
    requireHost(room, userId);
    requireLobby(room);
    if (targetId === userId) {
      throw new AppError('VALIDATION_ERROR', 'You cannot remove yourself. Leave the room instead.');
    }
    const target = room.players.get(targetId);
    if (!target) throw new AppError('NOT_FOUND', 'That player is not in the room.');
    room.kicked.add(targetId);
    if (target.socketId) toSocket(target.socketId, 'room:kicked', { reason: 'removed' });
    removePlayer(room, targetId);
  }

  /**
   * Locks the room and starts the game engine, which then runs the rounds on its own clock.
   * Without a game configuration (some tests) the room just stays in the STARTING phase.
   * @returns {object} the snapshot
   */
  function start({ userId }) {
    const room = rooms.get(byUser.get(userId));
    if (!room) throw new AppError('ROOM_NOT_FOUND', 'You are not in a room.');
    requireHost(room, userId);
    requireLobby(room);
    const connected = [...room.players.values()].filter((p) => p.connected && !p.left).length;
    if (connected < LIMITS.PLAYERS_MIN) {
      throw new AppError(
        'INVALID_PHASE',
        `You need at least ${LIMITS.PLAYERS_MIN} players to start.`,
      );
    }
    room.status = 'in_progress';
    room.phase = 'STARTING';
    for (const p of room.players.values()) p.score = 0;
    toRoom(room.code, 'game:started', { totalRounds: room.settings.rounds });
    if (game) {
      room.engine = createGameEngine({
        room,
        clock,
        validation: game.validation,
        pickLetter: game.pickLetter,
        store: game.store,
        timing: game.timing,
        judge: game.judge,
        dictionary: game.dictionary,
        logger: game.logger,
        emit: {
          room: (event, payload) => toRoom(room.code, event, payload),
          socket: toSocket,
        },
        onChange: () => {
          touch(room);
          sendState(room);
        },
      });
      room.engine.start();
    } else {
      touch(room);
      sendState(room);
    }
    return snapshot(room, userId);
  }

  function inGame(userId) {
    const room = rooms.get(byUser.get(userId));
    if (!room?.engine) throw new AppError('INVALID_PHASE', 'There is no game running.');
    return room;
  }

  /** The player's typed answers, kept in memory until the round ends. Never fails loudly. */
  function draft({ userId, roundIndex, answers }) {
    const room = rooms.get(byUser.get(userId));
    room?.engine?.draft(userId, roundIndex, answers);
  }

  /** The player pressed Done. @returns {{ finishOrder: number }} */
  function submit({ userId, roundIndex, answers }) {
    const room = inGame(userId);
    room.lastActivity = clock.now();
    return room.engine.submit(userId, roundIndex, answers);
  }

  /** A player challenges another player's answer or appeals their own. The check runs in the background. */
  function challenge({ userId, ...data }) {
    const room = inGame(userId);
    room.lastActivity = clock.now();
    const { challengeId, type } = room.engine.challenge(userId, data);
    return { challengeId, type };
  }

  /** The host moves on from the review. */
  function skipReview({ userId }) {
    const room = inGame(userId);
    requireHost(room, userId);
    room.engine.skipReview();
  }

  /** The host takes everyone back to the lobby after a game. Players who left are dropped. */
  function playAgain({ userId }) {
    const room = rooms.get(byUser.get(userId));
    if (!room) throw new AppError('ROOM_NOT_FOUND', 'You are not in a room.');
    requireHost(room, userId);
    if (room.phase !== 'GAME_OVER') {
      throw new AppError('INVALID_PHASE', 'The game is not over yet.');
    }
    room.engine?.dispose();
    room.engine = null;
    for (const p of [...room.players.values()]) {
      if (p.left) room.players.delete(p.userId);
      else p.score = 0;
    }
    room.status = 'lobby';
    room.phase = 'LOBBY';
    touch(room);
    sendState(room);
    return snapshot(room, userId);
  }

  /** A socket dropped. The seat is kept for the grace period; then the player leaves. */
  function disconnect({ userId, socketId }) {
    const room = rooms.get(byUser.get(userId));
    const player = room?.players.get(userId);
    if (!player || player.socketId !== socketId) return; // an old tab closing after a takeover
    player.connected = false;
    player.socketId = null;
    toRoom(room.code, 'room:playerDisconnected', { userId });
    touch(room);
    room.engine?.playersChanged();
    sendState(room);
    player.graceTimer = clock.setTimeout(() => {
      player.graceTimer = null;
      if (rooms.get(room.code) === room && room.players.get(userId) === player) {
        retire(room, userId);
      }
    }, LIMITS.REJOIN_GRACE_SECONDS * 1000);
  }

  /**
   * Closes rooms with no activity for the idle time (joins, leaves, settings and game events all
   * count as activity). Players still in them are told. Call it once a minute.
   */
  function sweepIdle() {
    const limit = LIMITS.ROOM_IDLE_MINUTES * 60_000;
    for (const room of [...rooms.values()]) {
      if (clock.now() - room.lastActivity <= limit) continue;
      toRoom(room.code, 'error:notice', {
        code: 'ROOM_CLOSED',
        message: 'This room was closed because nothing happened for a while.',
      });
      for (const p of room.players.values()) if (p.socketId) leave(p.socketId, room.code);
      dropRoom(room);
    }
  }

  /** @returns {object|null} the snapshot of the room this player is in */
  function findByUser(userId) {
    const room = rooms.get(byUser.get(userId));
    return room ? snapshot(room, userId) : null;
  }

  /**
   * The short description shown before joining.
   * @throws {AppError} ROOM_NOT_FOUND
   */
  function preview(code) {
    const normalized = normalizeRoomCode(code);
    if (!isRoomCodeFormat(normalized)) throw new AppError('ROOM_NOT_FOUND', 'Room not found.');
    const room = requireRoom(normalized);
    const players = [...room.players.values()];
    return {
      code: room.code,
      status: room.status,
      playerCount: players.length,
      maxPlayers: room.settings.maxPlayers,
      rounds: room.settings.rounds,
      hostNickname: room.players.get(room.hostId)?.nickname ?? '',
      players: players
        .slice(0, 5)
        .map((p) => ({ nickname: p.nickname, avatarColor: p.avatarColor })),
    };
  }

  return {
    setNotify,
    create,
    join: joinRoom,
    leave: leaveRoom,
    updateSettings,
    kick,
    start,
    draft,
    submit,
    skipReview,
    challenge,
    playAgain,
    disconnect,
    sweepIdle,
    findByUser,
    preview,
    size: () => rooms.size,
  };
}
