import mongoose from 'mongoose';
import { AVATAR_COLORS, LIMITS, ROOM_CODE } from '@fastfour/shared';

const playerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, required: true },
    avatarColor: { type: String, enum: AVATAR_COLORS },
    joinedAt: { type: Date, default: Date.now },
    connected: { type: Boolean, default: true },
    score: { type: Number, default: 0 },
  },
  { _id: false },
);

const roomSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      minlength: ROOM_CODE.LENGTH,
      maxlength: ROOM_CODE.LENGTH,
    },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['lobby', 'in_progress', 'finished', 'abandoned'],
      default: 'lobby',
    },
    settings: {
      maxPlayers: { type: Number, min: LIMITS.PLAYERS_MIN, max: LIMITS.PLAYERS_MAX, default: 8 },
      rounds: { type: Number, min: LIMITS.ROUNDS_MIN, max: LIMITS.ROUNDS_MAX, default: 10 },
    },
    players: { type: [playerSchema], default: [] },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Rooms are deleted six hours after their last activity: roomPersistence.purgeExpired does it,
// the same way expired sessions are removed in code instead of by a TTL index.
roomSchema.index({ expiresAt: 1 });

export const Room = mongoose.models.Room ?? mongoose.model('Room', roomSchema);
