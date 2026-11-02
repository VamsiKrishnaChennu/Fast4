import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, refreshAccessToken } from '../api/axiosClient.js';
import { setServerOffset } from '../utils/serverClock.js';
import { S } from '../utils/strings.js';
import { useAuth } from './AuthContext.jsx';

const RealtimeContext = createContext(null);

const ACK_TIMEOUT_MS = 5000;

/** An error answered by the server (or a timeout) for a socket request. */
export class RealtimeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'RealtimeError';
    this.code = code;
    this.details = details;
  }
}

/** The real connection. Tests pass their own factory. */
export function createSocket() {
  return io(import.meta.env.VITE_API_URL ?? '', {
    // A function, so every reconnect uses the newest access token.
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ['websocket', 'polling'],
  });
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * Keeps the socket connection and the room the player is in. The server sends a full snapshot
 * (room:state) after every change, so the room is always replaced, never patched.
 * @param {{ socketFactory?: () => import('socket.io-client').Socket }} props
 */
export function RealtimeProvider({ children, socketFactory = createSocket }) {
  const { status } = useAuth();
  const [connection, setConnection] = useState('connecting');
  const [room, setRoom] = useState(null);
  const [notice, setNotice] = useState(null);
  const socketRef = useRef(null);
  const roomRef = useRef(null);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    if (status !== 'authed') return undefined;
    const socket = socketFactory();
    socketRef.current = socket;
    let refreshing = false;

    /** Asks the server for its time three times and keeps the middle answer. */
    const syncTime = async () => {
      const offsets = [];
      for (let i = 0; i < 3; i += 1) {
        const sentAt = Date.now();
        const answer = await new Promise((resolve) => {
          socket
            .timeout(ACK_TIMEOUT_MS)
            .emit('time:sync', {}, (err, res) => resolve(err ? null : res));
        });
        if (answer?.ok) offsets.push(answer.data.serverNow - (sentAt + Date.now()) / 2);
      }
      if (offsets.length > 0) setServerOffset(median(offsets));
    };

    socket.on('connect', () => {
      setConnection('connected');
      syncTime();
    });
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('connect_error', async (err) => {
      setConnection('disconnected');
      const code = err?.data?.code;
      if ((code === 'TOKEN_EXPIRED' || code === 'UNAUTHENTICATED') && !refreshing) {
        refreshing = true;
        try {
          await refreshAccessToken();
          socket.connect();
        } catch {
          // The session is really gone; the auth layer sends the player to log in.
        } finally {
          refreshing = false;
        }
      }
    });
    socket.on('room:state', (state) => setRoom(state));
    socket.on('room:kicked', ({ reason }) => {
      const before = roomRef.current;
      const host = before?.players.find((p) => p.userId === before.hostId);
      setNotice({
        type: reason === 'takeover' ? 'takeover' : 'removed',
        hostNickname: host?.nickname ?? '',
      });
      setRoom(null);
    });
    socket.on('error:notice', ({ code }) => {
      if (code === 'ROOM_CLOSED') {
        setNotice({ type: 'closed', hostNickname: '' });
        setRoom(null);
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
      setRoom(null);
      setNotice(null);
      setConnection('connecting');
    };
  }, [status, socketFactory]);

  /** Sends a request and resolves with the server's data; rejects with a RealtimeError. */
  const emitAck = useCallback(
    (event, payload) =>
      new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket) {
          reject(new RealtimeError('NOT_CONNECTED', S.group.notConnected));
          return;
        }
        socket.timeout(ACK_TIMEOUT_MS).emit(event, payload ?? {}, (err, res) => {
          if (err) {
            reject(new RealtimeError('TIMEOUT', S.group.timedOut));
          } else if (res?.ok) {
            resolve(res.data);
          } else {
            reject(
              new RealtimeError(
                res?.error?.code ?? 'INTERNAL',
                res?.error?.message ?? S.errors.generic,
                res?.error?.details,
              ),
            );
          }
        });
      }),
    [],
  );

  const value = useMemo(
    () => ({
      connection,
      room,
      notice,
      emitAck,
      clearNotice: () => setNotice(null),
      async createRoom(settings) {
        const data = await emitAck('room:create', settings ? { settings } : {});
        setRoom(data.room);
        return data.code;
      },
      async joinRoom(code) {
        const data = await emitAck('room:join', { code });
        setRoom(data.room);
        return data.room.code;
      },
      async leaveRoom() {
        try {
          await emitAck('room:leave');
        } finally {
          setRoom(null);
        }
      },
      async updateSettings(settings) {
        const data = await emitAck('room:updateSettings', { settings });
        setRoom(data.room);
      },
      kick: (userId) => emitAck('room:kick', { userId }),
      async startGame() {
        const data = await emitAck('game:start');
        setRoom(data.room);
      },
    }),
    [connection, room, notice, emitAck],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider');
  return ctx;
}
