import mongoose from 'mongoose';
import { CATEGORIES } from '@fastfour/shared';

const judgeCacheSchema = new mongoose.Schema({
  category: { type: String, enum: CATEGORIES, required: true },
  word: { type: String, required: true },
  result: { type: String, enum: ['valid', 'invalid', 'inconclusive'], required: true },
  source: { type: String, required: true },
  checkedAt: { type: Date, required: true },
  // null = never expires (valid results). Invalid: 30 days, inconclusive: 1 day.
  expireAt: { type: Date, default: null },
});

judgeCacheSchema.index({ category: 1, word: 1 }, { unique: true });
// No TTL index: expired entries are ignored on read and deleted by the cache itself (see
// services/judgeCache.js), the same way expired rooms and sessions are handled.
judgeCacheSchema.index({ expireAt: 1 });

export const JudgeCache =
  mongoose.models.JudgeCache ?? mongoose.model('JudgeCache', judgeCacheSchema);
