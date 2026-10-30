import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

function limiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new AppError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.')),
  });
}

/** General API limit: 100 requests per minute per IP. */
export const createApiLimiter = ({ windowMs = 60_000, limit = 100 } = {}) =>
  limiter({ windowMs, limit });

/** Auth limit: 10 requests per 15 minutes per IP. Used from Phase 2. */
export const createAuthLimiter = ({ windowMs = 15 * 60_000, limit = 10 } = {}) =>
  limiter({ windowMs, limit });
