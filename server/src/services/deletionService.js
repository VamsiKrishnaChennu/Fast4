import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { CATEGORIES } from '@fastfour/shared';
import { Block } from '../models/Block.js';
import { Challenge } from '../models/Challenge.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { Game } from '../models/Game.js';
import { Report } from '../models/Report.js';
import { Room } from '../models/Room.js';
import { Round } from '../models/Round.js';
import { Session } from '../models/Session.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

export const DELETED_NICKNAME = 'Deleted player';

/**
 * Deletes an account and its personal data (docs/DELETION.md lists exactly what happens).
 * Group games stay so the other players' scores and history remain correct; the deleted
 * player's entry becomes "Deleted player" under a new random id that matches no account, and
 * the words they typed are removed. Everything else about the person is removed.
 *
 * The account record is removed last, so if anything fails half way the person can try again.
 *
 * @param {object} [deps]
 * @param {{ leave: Function }} [deps.roomManager] used to take the player out of a live room
 * @param {import('pino').Logger} [deps.logger]
 */
export function createDeletionService({ roomManager, logger } = {}) {
  let disconnectUser = () => {};

  const asIds = (ids) => mongoose.trusted({ $in: ids });
  const sameUser = (a, uid) => String(a) === String(uid);

  /** Group games: keep the entry, drop the name and the link to the account. */
  async function anonymizeGroupGames(uid, anon) {
    const games = await Game.find({ mode: 'group', 'players.userId': uid }).select(
      'players winnerIds',
    );
    for (const game of games) {
      const players = game.players.map((p) =>
        sameUser(p.userId, uid)
          ? { ...p.toObject(), userId: anon, nickname: DELETED_NICKNAME }
          : p.toObject(),
      );
      const winnerIds = game.winnerIds.map((id) => (sameUser(id, uid) ? anon : id));
      await Game.updateOne({ _id: game._id }, { $set: { players, winnerIds } });
    }
  }

  async function anonymizeRooms(uid, anon) {
    const rooms = await Room.find({
      $or: [{ 'players.userId': uid }, { hostId: uid }],
    });
    for (const room of rooms) {
      const players = room.players.map((p) =>
        sameUser(p.userId, uid)
          ? { ...p.toObject(), userId: anon, nickname: DELETED_NICKNAME }
          : p.toObject(),
      );
      const hostId = sameUser(room.hostId, uid) ? anon : room.hostId;
      await Room.updateOne({ _id: room._id }, { $set: { players, hostId } });
    }
  }

  async function removeSinglePlayerGames(uid) {
    const games = await Game.find({ mode: 'single', 'players.userId': uid }).select('_id').lean();
    const ids = games.map((g) => g._id);
    if (ids.length === 0) return;
    await Submission.deleteMany({ gameId: asIds(ids) });
    await Round.deleteMany({ gameId: asIds(ids) });
    await Game.deleteMany({ _id: asIds(ids) });
  }

  return {
    /** Lets the socket layer provide the way to close a user's connections once it exists. */
    setDisconnect(fn) {
      disconnectUser = fn;
    },

    /**
     * @param {string} userId
     * @param {string} password the account password, asked again as confirmation
     * @throws {AppError} UNAUTHENTICATED (no such account), VALIDATION_ERROR (wrong password),
     *   FORBIDDEN (admin accounts)
     */
    async deleteAccount(userId, password) {
      const user = await User.findById(userId).select('+passwordHash role');
      if (!user) throw new AppError('UNAUTHENTICATED', 'Please log in.');
      if (!(await bcrypt.compare(password, user.passwordHash))) {
        throw new AppError('VALIDATION_ERROR', 'That password is not right.', [
          { field: 'password', message: 'That password is not right.' },
        ]);
      }
      if (user.role === 'admin') {
        throw new AppError('FORBIDDEN', 'Admin accounts cannot be deleted here.');
      }
      const uid = user._id;
      const anon = new mongoose.Types.ObjectId();

      // Lock the account out first: old tokens stop working at once.
      await User.updateOne({ _id: uid }, { $inc: { tokenVersion: 1 } });
      await Session.deleteMany({ userId: uid });
      roomManager?.leave({ userId: String(uid) });
      disconnectUser(String(uid));

      await removeSinglePlayerGames(uid);
      await anonymizeGroupGames(uid, anon);
      await anonymizeRooms(uid, anon);
      const erased = Object.fromEntries(
        CATEGORIES.flatMap((c) => [
          [`answers.${c}.raw`, ''],
          [`answers.${c}.normalized`, ''],
          [`answers.${c}.matchKey`, ''],
        ]),
      );
      await Submission.updateMany({ userId: uid }, { $set: { userId: anon, ...erased } });
      await Round.updateMany({ bonusWinnerId: uid }, { $set: { bonusWinnerId: anon } });
      await Challenge.updateMany({ targetUserId: uid }, { $set: { targetUserId: anon, word: '' } });
      await Challenge.updateMany({ initiatorId: uid }, { $set: { initiatorId: anon } });
      await ChatMessage.deleteMany({ userId: uid });
      await Block.deleteMany({ userId: uid });
      await Block.deleteMany({ blockedUserId: uid });
      await Report.deleteMany({ reporterId: uid });
      await Report.deleteMany({ targetUserId: uid });
      await User.deleteOne({ _id: uid });
      logger?.info({ userId: String(uid) }, 'account deleted');
    },
  };
}
