import { AppError } from './AppError.js';

/**
 * The outside word-check source could not be reached or ran out of time. The challenge is not used up.
 * `reason` says why (for example "timeout", "network" or "http 429") and `retryAfterMs` how long the source asked us to wait. Both are only for logs and diagnostics.
 */
export class JudgeUnavailableError extends AppError {
  constructor(
    message = 'Could not check right now. Try again.',
    reason = 'unknown',
    retryAfterMs = 0,
  ) {
    super('JUDGE_UNAVAILABLE', message);
    this.name = 'JudgeUnavailableError';
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}
