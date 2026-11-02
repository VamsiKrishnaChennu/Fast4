/**
 * A stand-in for the Socket.IO client. `handlers` answer requests by event name, receiving the
 * payload and returning the ack ({ ok: true, data } or { ok: false, error }). Tests push server
 * events with receive(event, payload).
 */
export function createFakeSocket(handlers = {}) {
  const listeners = new Map();
  const socket = {
    connected: false,
    emitted: [],
    handlers,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return socket;
    },
    removeAllListeners() {
      listeners.clear();
      return socket;
    },
    close() {
      socket.connected = false;
    },
    connect() {
      socket.open();
    },
    timeout() {
      return {
        emit(event, payload, cb) {
          socket.emitted.push({ event, payload });
          const handler = socket.handlers[event];
          const answer =
            event === 'time:sync' && !handler
              ? { ok: true, data: { serverNow: Date.now() } }
              : handler
                ? handler(payload, socket)
                : { ok: true, data: {} };
          Promise.resolve(answer).then((res) => cb(null, res));
        },
      };
    },
    receive(event, payload) {
      for (const fn of listeners.get(event) ?? []) fn(payload);
    },
    open() {
      socket.connected = true;
      socket.receive('connect');
    },
    drop() {
      socket.connected = false;
      socket.receive('disconnect', 'transport close');
    },
    calls: (event) => socket.emitted.filter((e) => e.event === event),
  };
  return socket;
}

export const sampleRoom = (over = {}) => ({
  code: 'K7Q2MX',
  status: 'lobby',
  phase: 'LOBBY',
  settings: { maxPlayers: 8, rounds: 10 },
  hostId: 'u1',
  standings: [],
  openChallenges: [],
  players: [
    {
      userId: 'u1',
      nickname: 'Maya',
      avatarColor: '#FFC247',
      joinedAt: '2026-11-02T10:00:00.000Z',
      connected: true,
      left: false,
      score: 0,
    },
  ],
  ...over,
});

export const samplePlayer = (n, over = {}) => ({
  userId: `u${n}`,
  nickname: ['Maya', 'Arjun', 'Priya', 'Ben', 'Cyrus'][n - 1] ?? `Player${n}`,
  avatarColor: ['#FFC247', '#2F66F5', '#1FA463', '#E8473F', '#1B2250'][n - 1] ?? '#FFC247',
  joinedAt: '2026-11-02T10:00:00.000Z',
  connected: true,
  left: false,
  score: 0,
  ...over,
});
