import { AppError } from './AppError.js';

/** The outside word-check source could not be reached or ran out of time. The challenge is not used up. */
export class JudgeUnavailableError extends AppError {
  constructor(message = 'Could not check right now. Try again.') {
    super('JUDGE_UNAVAILABLE', message);
    this.name = 'JudgeUnavailableError';
  }
}
