import mongoose from 'mongoose';
import { LIMITS } from '@fastfour/shared';
import { AppError } from '../utils/AppError.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { Report } from '../models/Report.js';
import { Session } from '../models/Session.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reports from players and the actions an admin takes on them.
 * @param {object} [deps]
 * @param {{ now: () => number }} [deps.clock]
 * @param {(userId: string) => void} [deps.disconnectUser] closes a banned user's live connections
 */
export function createModerationService({
  clock = { now: () => Date.now() },
  disconnectUser: initialDisconnect = () => {},
  reportModel = Report,
  userModel = User,
  messageModel = ChatMessage,
  submissionModel = Submission,
  sessionModel = Session,
} = {}) {
  let disconnectUser = initialDisconnect;

  /** The text that is saved with a report, copied now so later changes do not affect it. */
  async function snapshotFor({ context, refId, target }) {
    if (context === 'nickname') return target.nickname;
    if (!refId) {
      throw new AppError('VALIDATION_ERROR', 'Say which message or answer you are reporting.');
    }
    if (context === 'chat') {
      const message = await messageModel.findById(refId).lean();
      if (!message || String(message.userId) !== String(target._id)) {
        throw new AppError('NOT_FOUND', 'That message is no longer available.');
      }
      return message.text;
    }
    const sub = await submissionModel.findById(refId).lean();
    if (!sub || String(sub.userId) !== String(target._id)) {
      throw new AppError('NOT_FOUND', 'That answer is no longer available.');
    }
    return ['name', 'place', 'animal', 'thing'].map((c) => sub.answers?.[c]?.raw ?? '').join(' / ');
  }

  return {
    /** Lets the socket layer provide the way to close a user's connections after it exists. */
    setDisconnect(fn) {
      disconnectUser = fn;
    },

    /**
     * @param {string} reporterId
     * @param {{ targetUserId: string, context: string, refId?: string, reason: string, details?: string }} input
     * @throws {AppError} VALIDATION_ERROR, NOT_FOUND or RATE_LIMITED (more than 10 reports in a day)
     */
    async createReport(reporterId, input) {
      if (reporterId === input.targetUserId) {
        throw new AppError('VALIDATION_ERROR', 'You cannot report yourself.');
      }
      const since = new Date(clock.now() - DAY_MS);
      const today = await reportModel.countDocuments({
        reporterId,
        createdAt: mongoose.trusted({ $gte: since }),
      });
      if (today >= LIMITS.REPORTS_PER_DAY) {
        throw new AppError(
          'RATE_LIMITED',
          'You have sent a lot of reports today. Try again later.',
        );
      }
      const target = await userModel.findById(input.targetUserId).select('nickname').lean();
      if (!target) throw new AppError('NOT_FOUND', 'That player does not exist.');
      const snapshot = await snapshotFor({ ...input, target });
      const report = await reportModel.create({
        reporterId,
        targetUserId: input.targetUserId,
        context: input.context,
        refId: input.refId ?? null,
        snapshot: snapshot.slice(0, 200),
        targetNickname: target.nickname,
        reason: input.reason,
        details: input.details ?? '',
      });
      return { id: String(report._id) };
    },

    /** @returns {Promise<object[]>} reports with the given status, newest first */
    async list(status = 'open') {
      const reports = await reportModel.find({ status }).sort({ createdAt: -1 }).limit(200).lean();
      const ids = [
        ...new Set(reports.flatMap((r) => [String(r.reporterId), String(r.targetUserId)])),
      ];
      const users = await userModel
        .find({ _id: mongoose.trusted({ $in: ids }) })
        .select('nickname mutedUntil bannedAt')
        .lean();
      const byId = new Map(users.map((u) => [String(u._id), u]));
      return reports.map((r) => ({
        id: String(r._id),
        status: r.status,
        context: r.context,
        reason: r.reason,
        details: r.details,
        snapshot: r.snapshot,
        reporter: {
          id: String(r.reporterId),
          nickname: byId.get(String(r.reporterId))?.nickname ?? '',
        },
        target: {
          id: String(r.targetUserId),
          nickname: byId.get(String(r.targetUserId))?.nickname ?? r.targetNickname,
          mutedUntil: byId.get(String(r.targetUserId))?.mutedUntil ?? null,
          banned: Boolean(byId.get(String(r.targetUserId))?.bannedAt),
        },
        createdAt: r.createdAt,
        handledAt: r.handledAt,
      }));
    },

    /**
     * dismiss closes the report; mute stops the target chatting for `hours` (default 24); ban
     * suspends the account, signs every session out and closes live connections.
     * @throws {AppError} NOT_FOUND, CONFLICT (already handled) or FORBIDDEN (cannot act on an admin)
     */
    async act(reportId, adminId, { action, hours }) {
      const report = await reportModel.findById(reportId).lean();
      if (!report) throw new AppError('NOT_FOUND', 'That report does not exist.');
      if (report.status !== 'open')
        throw new AppError('CONFLICT', 'That report was already handled.');
      const targetId = String(report.targetUserId);
      const now = new Date(clock.now());
      if (action !== 'dismiss') {
        const target = await userModel.findById(targetId).select('role').lean();
        if (!target) throw new AppError('NOT_FOUND', 'That player no longer exists.');
        if (target.role === 'admin') throw new AppError('FORBIDDEN', 'You cannot act on an admin.');
      }
      if (action === 'mute') {
        const until = new Date(clock.now() + (hours ?? LIMITS.MUTE_HOURS_DEFAULT) * 60 * 60 * 1000);
        await userModel.updateOne({ _id: targetId }, { $set: { mutedUntil: until } });
      } else if (action === 'ban') {
        await userModel.updateOne(
          { _id: targetId },
          { $set: { bannedAt: now }, $inc: { tokenVersion: 1 } },
        );
        await sessionModel.deleteMany({ userId: targetId });
        disconnectUser(targetId);
      }
      const status = { dismiss: 'dismissed', mute: 'muted', ban: 'banned' }[action];
      await reportModel.updateOne(
        { _id: reportId },
        { $set: { status, handledBy: adminId, handledAt: now } },
      );
      return { status };
    },
  };
}
