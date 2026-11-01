import mongoose from 'mongoose';
import { CATEGORIES } from '@fastfour/shared';

const answerSchema = new mongoose.Schema(
  {
    raw: { type: String, default: '' },
    normalized: { type: String, default: '' },
    verdict: { type: String, enum: ['valid', 'invalid', 'blank'], required: true },
    verdictSource: {
      type: String,
      enum: ['dictionary', 'rule', 'challenge_valid', 'challenge_invalid'],
    },
    reason: { type: String },
    matchKey: { type: String },
    count: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
  },
  { _id: false },
);

const submissionSchema = new mongoose.Schema(
  {
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', required: true },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    answers: Object.fromEntries(CATEGORIES.map((c) => [c, { type: answerSchema, required: true }])),
    finishedAt: { type: Date, default: null },
    finishOrder: { type: Number, default: null },
    firstFinisherBonus: { type: Number, default: 0 },
    timeBonus: { type: Number, default: 0 },
    roundScore: { type: Number, default: 0 },
    // Single mode: seconds between writing starting and Done; the full round when the timer ran out.
    secondsUsed: { type: Number, default: null },
    missed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

submissionSchema.index({ roundId: 1, userId: 1 }, { unique: true });

export const Submission =
  mongoose.models.Submission ?? mongoose.model('Submission', submissionSchema);
