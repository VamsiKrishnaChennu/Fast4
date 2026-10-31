import mongoose from 'mongoose';
import { AVATAR_COLORS } from '@fastfour/shared';

const userSchema = new mongoose.Schema(
  {
    nickname: { type: String, required: true, trim: true },
    nicknameLower: { type: String, required: true, unique: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    avatarColor: { type: String, enum: AVATAR_COLORS, default: AVATAR_COLORS[0] },
    stats: {
      gamesPlayed: { type: Number, default: 0 },
      groupGamesPlayed: { type: Number, default: 0 },
      groupWins: { type: Number, default: 0 },
      groupTotalScore: { type: Number, default: 0 },
      singleGamesPlayed: { type: Number, default: 0 },
      bestSingleScore: { type: Number, default: 0 },
      bestByRounds: { type: Map, of: Number, default: {} },
      uniqueAnswers: { type: Number, default: 0 },
    },
    tokenVersion: { type: Number, default: 0, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    ageConfirmedAt: { type: Date, required: true },
    termsAcceptedAt: { type: Date, required: true },
    mutedUntil: { type: Date, default: null },
    bannedAt: { type: Date, default: null },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
