import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

/**
 * Turns any error into the standard error body. Internal details are never sent to the client.
 * @param {{ logger: import('pino').Logger }} options
 */
export function createErrorHandler({ logger }) {
  return (err, req, res, next) => {
    let appError;
    if (err instanceof AppError) {
      appError = err;
    } else if (err instanceof ZodError) {
      appError = new AppError(
        'VALIDATION_ERROR',
        'Some fields are invalid.',
        err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    } else if (err?.type === 'entity.parse.failed') {
      appError = new AppError('VALIDATION_ERROR', 'The request body is not valid JSON.');
    } else if (err?.type === 'entity.too.large') {
      appError = new AppError('VALIDATION_ERROR', 'The request body is too large.');
    } else {
      appError = new AppError('INTERNAL', 'Something went wrong. Please try again.');
    }

    if (appError.status >= 500) {
      logger.error({ err, reqId: req.id }, 'unhandled error');
    }
    if (res.headersSent) {
      next(err);
      return;
    }
    const body = { code: appError.code, message: appError.message };
    if (appError.details) body.details = appError.details;
    res.status(appError.status).json({ error: body });
  };
}
