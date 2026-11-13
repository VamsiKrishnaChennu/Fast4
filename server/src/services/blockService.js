import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { Block } from '../models/Block.js';
import { User } from '../models/User.js';

/**
 * Who has blocked whom. A block only hides chat messages: nobody is removed from a room and no
 * score changes. The sets are cached in memory so chat delivery never waits on the database.
 * @param {{ blockModel?: typeof Block, userModel?: typeof User }} [deps]
 */
export function createBlockService({ blockModel = Block, userModel = User } = {}) {
  /** @type {Map<string, Set<string>>} blocker id -> ids they blocked */
  const cache = new Map();

  /** @returns {Promise<Set<string>>} ids the user has blocked */
  async function blockedSet(userId) {
    const hit = cache.get(userId);
    if (hit) return hit;
    const rows = await blockModel.find({ userId }).select('blockedUserId').lean();
    const set = new Set(rows.map((r) => String(r.blockedUserId)));
    // Another request may have changed the set while this one was loading; keep the newer one.
    return cache.get(userId) ?? (cache.set(userId, set), set);
  }

  return {
    blockedSet,

    /** Idempotent. @throws {AppError} VALIDATION_ERROR for yourself, NOT_FOUND for an unknown user */
    async add(userId, blockedUserId) {
      if (userId === blockedUserId) {
        throw new AppError('VALIDATION_ERROR', 'You cannot block yourself.');
      }
      if (!(await userModel.exists({ _id: blockedUserId }))) {
        throw new AppError('NOT_FOUND', 'That player does not exist.');
      }
      await blockModel.updateOne({ userId, blockedUserId }, { $setOnInsert: {} }, { upsert: true });
      (await blockedSet(userId)).add(blockedUserId);
    },

    async remove(userId, blockedUserId) {
      await blockModel.deleteOne({ userId, blockedUserId });
      (await blockedSet(userId)).delete(blockedUserId);
    },

    /** @returns {Promise<Array<{ userId: string, nickname: string, avatarColor: string, blockedAt: Date }>>} newest first */
    async list(userId) {
      const rows = await blockModel.find({ userId }).sort({ createdAt: -1 }).lean();
      const users = await userModel
        .find({ _id: mongoose.trusted({ $in: rows.map((r) => r.blockedUserId) }) })
        .select('nickname avatarColor')
        .lean();
      const byId = new Map(users.map((u) => [String(u._id), u]));
      return rows
        .filter((r) => byId.has(String(r.blockedUserId)))
        .map((r) => {
          const u = byId.get(String(r.blockedUserId));
          return {
            userId: String(u._id),
            nickname: u.nickname,
            avatarColor: u.avatarColor,
            blockedAt: r.createdAt,
          };
        });
    },

    /** Drops the cached set (for tests and account deletion). */
    forget(userId) {
      cache.delete(userId);
    },
  };
}
