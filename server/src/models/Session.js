import mongoose from 'mongoose';

/** One signed-in device. The refresh token's jti is the key; rotating or logging out deletes it. */
const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const Session = mongoose.models.Session ?? mongoose.model('Session', sessionSchema);
