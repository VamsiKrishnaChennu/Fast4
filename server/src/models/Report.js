import mongoose from 'mongoose';
import { LIMITS, REPORT_CONTEXTS } from '@fastfour/shared';

const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    context: { type: String, enum: REPORT_CONTEXTS, required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // The reported text, copied when the report is made, so later edits or deletes change nothing.
    snapshot: { type: String, default: '', maxlength: 200 },
    targetNickname: { type: String, default: '' },
    reason: { type: String, enum: LIMITS.REPORT_REASONS, required: true },
    details: { type: String, default: '', maxlength: LIMITS.REPORT_DETAILS_MAX },
    status: {
      type: String,
      enum: ['open', 'dismissed', 'muted', 'banned'],
      default: 'open',
    },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
reportSchema.index({ status: 1, createdAt: -1 });

export const Report = mongoose.models.Report ?? mongoose.model('Report', reportSchema);
