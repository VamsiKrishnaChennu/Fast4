import mongoose from 'mongoose';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connects to MongoDB, retrying with exponential backoff.
 * @param {object} options
 * @param {string} options.uri
 * @param {boolean} options.isProduction production turns automatic index creation off
 * @param {import('pino').Logger} options.logger
 * @param {number} [options.attempts]
 * @param {number} [options.baseDelayMs]
 * @param {Function} [options.connect] injectable for tests
 * @param {Function} [options.sleep] injectable for tests
 * @throws the last connection error after the final attempt
 */
export async function connectWithRetry({
  uri,
  isProduction,
  logger,
  attempts = 5,
  baseDelayMs = 500,
  connect = (u, o) => mongoose.connect(u, o),
  sleep = defaultSleep,
}) {
  mongoose.set('autoIndex', !isProduction);
  mongoose.set('sanitizeFilter', true);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await connect(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 20 });
      logger.info({ attempt }, 'database connected');
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn({ attempt, delay, err: err.message }, 'database connection failed, retrying');
      await sleep(delay);
    }
  }
}

/** @returns {boolean} true while the Mongoose connection is open */
export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

/** Closes the Mongoose connection. */
export async function disconnectDb() {
  await mongoose.disconnect();
}
