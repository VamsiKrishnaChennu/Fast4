import { jest } from '@jest/globals';
import { connectWithRetry } from '../../src/config/db.js';

const logger = { info: jest.fn(), warn: jest.fn() };

describe('connectWithRetry', () => {
  test('connects on the first attempt', async () => {
    const connect = jest.fn().mockResolvedValue();
    await connectWithRetry({ uri: 'mongodb://x/y', isProduction: false, logger, connect });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  test('retries with exponential backoff and then succeeds', async () => {
    const connect = jest
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue();
    const sleep = jest.fn().mockResolvedValue();
    await connectWithRetry({
      uri: 'mongodb://x/y',
      isProduction: false,
      logger,
      connect,
      sleep,
      baseDelayMs: 100,
    });
    expect(connect).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  test('throws the last error after five failed attempts', async () => {
    const connect = jest.fn().mockRejectedValue(new Error('still down'));
    const sleep = jest.fn().mockResolvedValue();
    await expect(
      connectWithRetry({ uri: 'mongodb://x/y', isProduction: true, logger, connect, sleep }),
    ).rejects.toThrow('still down');
    expect(connect).toHaveBeenCalledTimes(5);
  });
});
