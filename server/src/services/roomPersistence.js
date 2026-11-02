import mongoose from 'mongoose';
import { LIMITS } from '@fastfour/shared';
import { Room } from '../models/Room.js';

/**
 * Keeps a copy of every live room in MongoDB. The copy is for recovery and history only: the
 * running server answers from memory. Writes never block a game event and never throw.
 * @param {{ logger: import('pino').Logger, clock?: { now: () => number } }} deps
 */
export function createRoomPersistence({ logger, clock = { now: () => Date.now() } }) {
  /** @param {object} snapshot from roomManager.persistable(room) */
  async function save(snapshot) {
    try {
      await Room.updateOne(
        { code: snapshot.code },
        {
          $set: {
            hostId: snapshot.hostId,
            status: snapshot.status,
            settings: snapshot.settings,
            players: snapshot.players,
            expiresAt: new Date(clock.now() + LIMITS.ROOM_TTL_HOURS * 60 * 60 * 1000),
          },
        },
        { upsert: true },
      );
    } catch (err) {
      logger.warn({ err, code: snapshot.code }, 'could not save room');
    }
  }

  /** Marks a room as abandoned when the last player is gone. */
  async function close(code) {
    try {
      await Room.updateOne({ code }, { $set: { status: 'abandoned' } });
    } catch (err) {
      logger.warn({ err, code }, 'could not close room');
    }
  }

  /** On start-up: rooms that were open when the server stopped cannot be resumed. */
  async function abandonOpenRooms() {
    const result = await Room.updateMany(
      { status: mongoose.trusted({ $in: ['lobby', 'in_progress'] }) },
      { $set: { status: 'abandoned' } },
    );
    return result.modifiedCount ?? 0;
  }

  /** Deletes rooms whose six hours are over. Run it from the once-a-minute sweep. */
  async function purgeExpired() {
    try {
      const result = await Room.deleteMany({
        expiresAt: mongoose.trusted({ $lt: new Date(clock.now()) }),
      });
      return result.deletedCount ?? 0;
    } catch (err) {
      logger.warn({ err }, 'could not purge expired rooms');
      return 0;
    }
  }

  return { save, close, abandonOpenRooms, purgeExpired };
}
