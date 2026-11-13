import mongoose from 'mongoose';

const blockSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blockedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
blockSchema.index({ userId: 1, blockedUserId: 1 }, { unique: true });

export const Block = mongoose.models.Block ?? mongoose.model('Block', blockSchema);
