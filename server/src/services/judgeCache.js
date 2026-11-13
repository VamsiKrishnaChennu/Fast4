import mongoose from 'mongoose';
import { JudgeCache } from '../models/JudgeCache.js';

/**
 * MongoDB-backed cache for word checks. Same interface as the in-memory cache. There is no TTL index (FerretDB
 * and some hosts lack it): `get` ignores and deletes an expired entry, and `sweep` clears the rest at startup.
 * A database failure never breaks a check: it behaves like a miss.
 * @param {{ model?: typeof JudgeCache, now?: () => number, logger?: import('pino').Logger }} [deps]
 */
export function createMongoJudgeCache({ model = JudgeCache, now = Date.now, logger } = {}) {
  return {
    /** Deletes every expired entry. Run once at startup. @returns {Promise<number>} */
    async sweep() {
      try {
        const res = await model.deleteMany({
          expireAt: mongoose.trusted({ $ne: null, $lte: new Date(now()) }),
        });
        return res.deletedCount ?? 0;
      } catch (err) {
        logger?.warn({ err }, 'judge cache sweep failed');
        return 0;
      }
    },
    async get(category, word) {
      try {
        const hit = await model.findOne({ category, word }).lean();
        if (!hit) return null;
        const expireAt = hit.expireAt ? new Date(hit.expireAt).getTime() : null;
        if (expireAt !== null && expireAt <= now()) {
          model.deleteOne({ _id: hit._id }).catch(() => {});
          return null;
        }
        return { result: hit.result, source: hit.source, checkedAt: hit.checkedAt, expireAt };
      } catch (err) {
        logger?.warn({ err }, 'judge cache read failed');
        return null;
      }
    },
    async set(category, word, entry) {
      try {
        await model.updateOne(
          { category, word },
          {
            $set: {
              result: entry.result,
              source: entry.source,
              checkedAt: new Date(entry.checkedAt),
              expireAt: entry.expireAt === null ? null : new Date(entry.expireAt),
            },
          },
          { upsert: true },
        );
      } catch (err) {
        logger?.warn({ err }, 'judge cache write failed');
      }
    },
  };
}
