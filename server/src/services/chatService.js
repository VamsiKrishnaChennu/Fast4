import mongoose from 'mongoose';
import { LIMITS } from '@fastfour/shared';
import { AppError } from '../utils/AppError.js';
import { maskProfanity } from '../utils/profanity.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { User } from '../models/User.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Checks, cleans and saves one chat message. Room membership and the phase are the room
 * manager's job; who receives the message (blocks) is too.
 * @param {{ clock?: { now: () => number }, messageModel?: typeof ChatMessage, userModel?: typeof User, logger?: import('pino').Logger }} [deps]
 */
export function createChatService({
  clock = { now: () => Date.now() },
  messageModel = ChatMessage,
  userModel = User,
  logger,
} = {}) {
  /** @type {Map<string, number[]>} */
  const recent = new Map();

  function checkRate(userId) {
    const now = clock.now();
    const times = (recent.get(userId) ?? []).filter((t) => now - t < LIMITS.CHAT_RATE_WINDOW_MS);
    if (times.length >= LIMITS.CHAT_RATE_COUNT) {
      recent.set(userId, times);
      throw new AppError('RATE_LIMITED', 'You are sending messages too fast. Wait a moment.');
    }
    times.push(now);
    recent.set(userId, times);
  }

  return {
    /**
     * @param {{ userId: string, nickname: string, avatarColor?: string, roomCode: string, text: string }} input
     * @returns {Promise<{ id: string, userId: string, nickname: string, avatarColor?: string, text: string, at: number }>}
     * @throws {AppError} VALIDATION_ERROR, MUTED or RATE_LIMITED
     */
    async send({ userId, nickname, avatarColor, roomCode, text }) {
      const clean = String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (clean === '') throw new AppError('VALIDATION_ERROR', 'Write a message first.');
      if (clean.length > LIMITS.CHAT_MAX) {
        throw new AppError('VALIDATION_ERROR', `Keep it under ${LIMITS.CHAT_MAX} characters.`);
      }
      const user = await userModel.findById(userId).select('mutedUntil').lean();
      if (user?.mutedUntil && new Date(user.mutedUntil).getTime() > clock.now()) {
        throw new AppError('MUTED', 'You are muted and cannot chat for now.');
      }
      checkRate(userId);
      // Stored and sent as plain text: the client never renders it as HTML.
      const masked = maskProfanity(clean);
      const at = clock.now();
      let id;
      try {
        const doc = await messageModel.create({ roomCode, userId, nickname, text: masked });
        id = String(doc._id);
      } catch (err) {
        // The message is still delivered; it just cannot be reported later.
        logger?.warn({ err }, 'could not save chat message');
        id = `local-${at}-${userId}`;
      }
      return { id, userId, nickname, avatarColor, text: masked, at };
    },

    /** Deletes messages older than 7 days. @returns {Promise<number>} how many */
    async purgeOld() {
      const res = await messageModel.deleteMany({
        createdAt: mongoose.trusted({ $lt: new Date(clock.now() - WEEK_MS) }),
      });
      return res.deletedCount ?? 0;
    },
  };
}
