import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let memory;

/**
 * Connects Mongoose to a throwaway database. Uses an in-memory MongoDB, or the server named by
 * TEST_MONGODB_URI (a base URI without a database name) when it is set.
 */
export async function startTestDb() {
  const dbName = `t_${process.pid}_${Date.now()}`;
  let uri;
  if (process.env.TEST_MONGODB_URI) {
    uri = `${process.env.TEST_MONGODB_URI.replace(/\/$/, '')}/${dbName}`;
  } else {
    memory = await MongoMemoryServer.create();
    uri = `${memory.getUri()}${dbName}`;
  }
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

/** Deletes every document so each test starts clean. */
export async function clearDb() {
  await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany({})));
}

/** Drops the database and disconnects. */
export async function stopTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memory) await memory.stop();
  memory = undefined;
}
