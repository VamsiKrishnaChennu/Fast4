import { ERROR_CODES } from '@fastfour/shared';

/** An expected failure that maps to an HTTP status and a stable error code. */
export class AppError extends Error {
  /**
   * @param {string} code one of ERROR_CODES
   * @param {string} message plain language, safe to show to the player
   * @param {Array<{field?: string, message: string}>} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code] ?? 500;
    this.details = details;
  }
}
