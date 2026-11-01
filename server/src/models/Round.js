import mongoose from 'mongoose';

const roundSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    index: { type: Number, required: true, min: 0 },
    letter: { type: String, required: true, uppercase: true, minlength: 1, maxlength: 1 },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    bonusWinnerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: ['writing', 'review', 'complete'], default: 'writing' },
  },
  { timestamps: true },
);

roundSchema.index({ gameId: 1, index: 1 }, { unique: true });

export const Round = mongoose.models.Round ?? mongoose.model('Round', roundSchema);
