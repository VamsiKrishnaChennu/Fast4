import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { isDbConnected, disconnectDb } from '../../src/config/db.js';
import { createLogger } from '../../src/config/logger.js';
import { createAuthLimiter, createApiLimiter } from '../../src/middleware/rateLimit.js';
import { createTestApp } from '../helpers/createTestApp.js';
import request from 'supertest';

describe('database helpers', () => {
  test('isDbConnected reflects the Mongoose ready state', () => {
    expect(isDbConnected()).toBe(false);
  });

  test('disconnectDb closes the connection', async () => {
    const spy = jest.spyOn(mongoose, 'disconnect').mockResolvedValue();
    await disconnectDb();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('logger', () => {
  test('is silent in test and uses the configured level elsewhere', () => {
    expect(createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'debug' }).level).toBe('silent');
    expect(createLogger({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }).level).toBe('warn');
  });
});

describe('rate limiters', () => {
  test('factories build middleware with defaults', () => {
    expect(typeof createAuthLimiter()).toBe('function');
    expect(typeof createApiLimiter()).toBe('function');
  });
});

describe('plain http app origin', () => {
  test('uses ws:// in the CSP for an http origin', async () => {
    const app = createTestApp({ envSource: { APP_ORIGIN: 'http://localhost:4000' } });
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toContain('ws://localhost:4000');
  });
});
