import { AppError } from '../utils/AppError.js';

/** Unknown routes answer with the standard JSON 404. */
export function notFound(req, res, next) {
  next(new AppError('NOT_FOUND', 'That address does not exist.'));
}
