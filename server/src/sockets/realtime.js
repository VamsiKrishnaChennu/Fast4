import { Server } from 'socket.io';
import {
  C2S,
  emptyPayloadSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomKickSchema,
  roomUpdateSettingsSchema,
} from '@fastfour/shared';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { toAppError } from '../utils/toApiError.js';

/** More events than this in one second from one socket is treated as a flood. */
const FLOOD_PER_SECOND = 100;

/**
 * Attaches Socket.IO to the HTTP server and connects the room manager to it.
 * @param {object} deps
 * @param {import('node:http').Server} deps.httpServer
 * @param {object} deps.env validated configuration
 * @param {import('pino').Logger} deps.logger
 * @param {{ verifyAccess: (token: string) => { sub: string, tv?: number } }} deps.tokenService
 * @param {ReturnType<import('../services/roomManager.js').createRoomManager>} deps.roomManager
 * @returns {{ io: import('socket.io').Server, shutdown: () => Promise<void> }}
 */
export function createRealtime({ httpServer, env, logger, tokenService, roomManager }) {
  const io = new Server(httpServer, {
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 10 * 1024,
    cors: env.isProduction ? undefined : { origin: env.CLIENT_ORIGIN, credentials: true },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (env.isProduction && env.APP_ORIGIN && origin && origin !== env.APP_ORIGIN) {
        callback('Origin not allowed', false);
        return;
      }
      callback(null, true);
    },
  });

  roomManager.setNotify({
    room: (code, event, payload) => io.to(code).emit(event, payload),
    socket: (socketId, event, payload) => io.to(socketId).emit(event, payload),
    join: (socketId, code) => io.sockets.sockets.get(socketId)?.join(code),
    leave: (socketId, code) => io.sockets.sockets.get(socketId)?.leave(code),
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || token === '') {
        throw new AppError('UNAUTHENTICATED', 'Please log in.');
      }
      const payload = tokenService.verifyAccess(token);
      const user = await User.findById(payload.sub)
        .select('+tokenVersion nickname avatarColor bannedAt')
        .lean();
      if (!user || (user.tokenVersion ?? 0) !== payload.tv) {
        throw new AppError('UNAUTHENTICATED', 'Please log in.');
      }
      if (user.bannedAt)
        throw new AppError('ACCOUNT_SUSPENDED', 'This account has been suspended.');
      socket.data.user = {
        id: String(user._id),
        nickname: user.nickname,
        avatarColor: user.avatarColor,
      };
      next();
    } catch (err) {
      const appError = toAppError(err);
      const refused = new Error(appError.message);
      refused.data = { code: appError.code };
      next(refused);
    }
  });

  /**
   * Registers one event: checks the payload, runs the handler and answers through the ack.
   * Every failure becomes { ok: false, error: { code, message } }.
   */
  function register(socket, event, schema, handler) {
    socket.on(event, async (...args) => {
      const ack = typeof args.at(-1) === 'function' ? args.at(-1) : () => {};
      // Socket.IO turns a skipped payload into null on the wire, so null counts as "nothing sent".
      const raw = typeof args[0] === 'function' || args[0] === null ? undefined : args[0];
      try {
        const data = schema.parse(raw);
        const result = await handler(data, socket.data.user);
        ack({ ok: true, data: result ?? {} });
      } catch (err) {
        const appError = toAppError(err);
        if (appError.status >= 500) logger.error({ err, event }, 'socket handler failed');
        const error = { code: appError.code, message: appError.message };
        if (appError.details) error.details = appError.details;
        ack({ ok: false, error });
      }
    });
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;

    // Flood guard: a socket that sends far too many events is cut off.
    let windowStart = Date.now();
    let count = 0;
    socket.onAny(() => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
      }
      count += 1;
      if (count > FLOOD_PER_SECOND) {
        logger.warn({ userId: user.id }, 'socket flood, disconnecting');
        socket.disconnect(true);
      }
    });

    // A player coming back (refresh, lost connection) gets their seat and a fresh snapshot.
    const current = roomManager.findByUser(user.id);
    if (current) roomManager.join({ code: current.code, user, socketId: socket.id });

    register(socket, C2S.ROOM_CREATE, roomCreateSchema, ({ settings }) => {
      const room = roomManager.create({ user, settings, socketId: socket.id });
      return { code: room.code, room };
    });
    register(socket, C2S.ROOM_JOIN, roomJoinSchema, ({ code }) => {
      const { room, rejoined } = roomManager.join({ code, user, socketId: socket.id });
      return { room, rejoined };
    });
    register(socket, C2S.ROOM_LEAVE, emptyPayloadSchema, () => {
      roomManager.leave({ userId: user.id });
    });
    register(socket, C2S.ROOM_UPDATE_SETTINGS, roomUpdateSettingsSchema, ({ settings }) => ({
      room: roomManager.updateSettings({ userId: user.id, settings }),
    }));
    register(socket, C2S.ROOM_KICK, roomKickSchema, ({ userId }) => {
      roomManager.kick({ userId: user.id, targetId: userId });
    });
    register(socket, C2S.GAME_START, emptyPayloadSchema, () => ({
      room: roomManager.start({ userId: user.id }),
    }));
    register(socket, C2S.TIME_SYNC, emptyPayloadSchema, () => ({ serverNow: Date.now() }));

    socket.on('disconnect', () => roomManager.disconnect({ userId: user.id, socketId: socket.id }));
  });

  /** Tells everyone the server is restarting, then closes. */
  async function shutdown() {
    io.emit('error:notice', { code: 'SERVER_RESTARTING', message: 'The server is restarting.' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await io.close();
  }

  return { io, shutdown };
}
