import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    nickname: { type: String, required: true },
    text: { type: String, required: true, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// Messages are kept for 7 days. No TTL index (the stand-in test database lacks them): the
// chat service deletes old messages at start-up and once a day (see services/chatService.js).
chatMessageSchema.index({ createdAt: 1 });

export const ChatMessage =
  mongoose.models.ChatMessage ?? mongoose.model('ChatMessage', chatMessageSchema);
