import http from 'node:http';
import { io as connectClient } from 'socket.io-client';
import { loadEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { createApp } from '../../src/app.js';
import { createRoomManager } from '../../src/services/roomManager.js';
import { createRoomPersistence } from '../../src/services/roomPersistence.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createRealtime } from '../../src/sockets/realtime.js';
import { validEnvSource } from './createTestApp.js';
import { fixtureDictionary } from './fixtures.js';
import { signUp } from './singleHelpers.js';

/** Timers the test moves by hand, so grace periods need no real waiting. */
export function createFakeTimers(start = 1_000_000) {
  let now = start;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    /** Moves time forward and runs every timer that falls due, in order. */
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].fn();
      }
      now = target;
    },
    pending: () => timers.size,
  };
}

/** A real HTTP and Socket.IO server on a random port, using the fake timers for room rules. */
export async function startRealtimeServer({ clock = createFakeTimers(), persist = false } = {}) {
  const env = loadEnv(validEnvSource);
  const logger = createLogger(env);
  const persistence = persist ? createRoomPersistence({ logger }) : undefined;
  const roomManager = createRoomManager({
    clock,
    onChange: (snapshot) => persistence?.save(snapshot),
    onClose: (code) => persistence?.close(code),
  });
  const app = createApp({ env, logger, dictionary: fixtureDictionary(), roomManager });
  const server = http.createServer(app);
  const realtime = createRealtime({
    httpServer: server,
    env,
    logger,
    tokenService: createTokenService(env),
    roomManager,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];

  /** Connects a client. The returned object keeps a log of every event it receives. */
  function connect(token, { auth = { token } } = {}) {
    const socket = connectClient(url, {
      auth,
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    const log = [];
    socket.onAny((event, payload) => log.push({ event, payload }));
    const client = {
      socket,
      log,
      ready: () =>
        new Promise((resolve, reject) => {
          socket.once('connect', () => resolve(client));
          socket.once('connect_error', (err) => reject(err));
        }),
      emitAck: (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve)),
      /** Resolves with the first matching event, including ones that already arrived. */
      waitFor: (event, predicate = () => true, timeout = 2000) =>
        new Promise((resolve, reject) => {
          const hit = log.find((e) => e.event === event && predicate(e.payload));
          if (hit) {
            resolve(hit.payload);
            return;
          }
          const timer = setTimeout(() => {
            socket.offAny(listener);
            reject(new Error(`timed out waiting for ${event}`));
          }, timeout);
          const listener = (e, payload) => {
            if (e === event && predicate(payload)) {
              clearTimeout(timer);
              socket.offAny(listener);
              resolve(payload);
            }
          };
          socket.onAny(listener);
        }),
      count: (event) => log.filter((e) => e.event === event).length,
      lastState: () => log.filter((e) => e.event === 'room:state').at(-1)?.payload,
    };
    return client;
  }

  /** Signs up a user and returns a connected client for them. */
  async function player(nickname) {
    const { token, user } = await signUp(app, nickname);
    const client = await connect(token).ready();
    client.user = user;
    client.token = token;
    return client;
  }

  async function close() {
    for (const s of sockets) s.close();
    await realtime.io.close();
  }

  return { app, url, clock, roomManager, connect, player, close, realtime, env };
}

/** Lets pending events and timers run. */
export const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
