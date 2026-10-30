import { jest } from '@jest/globals';
import { z } from 'zod';
import { AppError } from '../../src/utils/AppError.js';
import { asyncHandler } from '../../src/utils/asyncHandler.js';
import { createErrorHandler } from '../../src/middleware/errorHandler.js';
import { validate } from '../../src/middleware/validate.js';
import { requestId } from '../../src/middleware/requestId.js';

function run(err, { headersSent = false } = {}) {
  const logger = { error: jest.fn() };
  const res = {
    headersSent,
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();
  createErrorHandler({ logger })(err, { id: 'req1' }, res, next);
  return { res, next, logger };
}

describe('AppError', () => {
  test('maps the code to its HTTP status', () => {
    expect(new AppError('ROOM_FULL', 'x').status).toBe(409);
    expect(new AppError('RATE_LIMITED', 'x').status).toBe(429);
    expect(new AppError('NOT_A_CODE', 'x').status).toBe(500);
  });
});

describe('error handler', () => {
  test('formats an AppError with details', () => {
    const { res } = run(
      new AppError('CONFLICT', 'Nickname taken', [{ field: 'nickname', message: 'taken' }]),
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'CONFLICT',
        message: 'Nickname taken',
        details: [{ field: 'nickname', message: 'taken' }],
      },
    });
  });

  test('turns zod errors into VALIDATION_ERROR with field details', () => {
    const parsed = z.object({ password: z.string().min(8) }).safeParse({ password: 'x' });
    const { res } = run(parsed.error);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details[0].field).toBe('password');
  });

  test('maps body-parser errors', () => {
    expect(run({ type: 'entity.parse.failed' }).res.status).toHaveBeenCalledWith(400);
    expect(run({ type: 'entity.too.large' }).res.status).toHaveBeenCalledWith(400);
  });

  test('hides the details of unexpected errors and logs them', () => {
    const { res, logger } = run(new Error('secret db password leaked'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret');
    expect(res.json.mock.calls[0][0].error.code).toBe('INTERNAL');
    expect(logger.error).toHaveBeenCalled();
  });

  test('passes on when headers were already sent', () => {
    const err = new Error('late');
    const { res, next } = run(err, { headersSent: true });
    expect(next).toHaveBeenCalledWith(err);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('asyncHandler', () => {
  test('forwards rejected promises to next', async () => {
    const next = jest.fn();
    const error = new Error('boom');
    await asyncHandler(async () => {
      throw error;
    })({}, {}, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('validate', () => {
  const schema = { body: z.object({ name: z.string() }).strict() };

  test('replaces the body with the parsed value', () => {
    const req = { body: { name: 'Ann' } };
    const next = jest.fn();
    validate(schema)(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('rejects unknown keys', () => {
    const next = jest.fn();
    validate(schema)({ body: { name: 'Ann', extra: 1 } }, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(z.ZodError);
  });
});

describe('requestId', () => {
  test('keeps a safe incoming id and replaces an unsafe one', () => {
    const res = { setHeader: jest.fn() };
    const good = { headers: { 'x-request-id': 'abc-123' } };
    requestId(good, res, () => {});
    expect(good.id).toBe('abc-123');
    const bad = { headers: { 'x-request-id': 'bad id with spaces!' } };
    requestId(bad, res, () => {});
    expect(bad.id).not.toBe('bad id with spaces!');
    expect(bad.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
