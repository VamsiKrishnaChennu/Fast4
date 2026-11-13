import mongoose from 'mongoose';
import { CATEGORIES } from '@fastfour/shared';

/** One finished challenge or appeal. A check that failed because the source was unreachable creates no document. */
const challengeSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', required: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    initiatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    word: { type: String, required: true },
    type: { type: String, enum: ['challenge', 'appeal'], required: true },
    outcome: { type: String, enum: ['overturned', 'upheld', 'inconclusive'], required: true },
    source: { type: String, enum: ['wikidata', 'dictionaryapi', 'cache', 'none'], default: 'none' },
    countsAsFailed: { type: Boolean, required: true },
    resolvedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

challengeSchema.index({ roundId: 1, targetUserId: 1, category: 1 }, { unique: true });

export const Challenge = mongoose.models.Challenge ?? mongoose.model('Challenge', challengeSchema);
