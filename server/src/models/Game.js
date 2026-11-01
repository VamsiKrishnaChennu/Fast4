import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, required: true },
    totalScore: { type: Number, default: 0 },
    uniqueAnswers: { type: Number, default: 0 },
    firstFinisherCount: { type: Number, default: 0 },
    failedChallenges: { type: Number, default: 0 },
    rank: { type: Number, default: null },
  },
  { _id: false },
);

const gameSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['single', 'group'], required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId },
    players: { type: [playerSchema], default: [] },
    settings: { rounds: { type: Number, required: true } },
    letters: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['in_progress', 'finished', 'abandoned'],
      default: 'in_progress',
    },
    // Single mode: a copy of players[0].totalScore so the leaderboard can use one flat index.
    totalScore: { type: Number, default: 0 },
    totalTimeMs: { type: Number, default: 0 },
    newPersonalBest: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    winnerIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

gameSchema.index({ mode: 1, status: 1, endedAt: -1 });
gameSchema.index({ 'players.userId': 1, endedAt: -1 });
// Single-player leaderboards: one rounds setting at a time, best score first, then fastest.
gameSchema.index({ mode: 1, status: 1, 'settings.rounds': 1, totalScore: -1, totalTimeMs: 1 });

export const Game = mongoose.models.Game ?? mongoose.model('Game', gameSchema);
