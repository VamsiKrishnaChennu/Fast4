import { ZodError } from 'zod';
import { AppError } from './AppError.js';

/**
 * Turns any thrown value into an AppError. Details of unexpected failures are never passed on.
 * @param {unknown} err
 * @returns {AppError}
 */
export function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError(
      'VALIDATION_ERROR',
      'Some fields are invalid.',
      err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return new AppError('INTERNAL', 'Something went wrong. Please try again.');
}
