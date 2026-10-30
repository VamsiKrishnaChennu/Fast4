/** Game rules, limits and scoring values shared by client and server. Never duplicate these. */
export const CATEGORIES = ['name', 'place', 'animal', 'thing'];

/** 21 letters: excludes Q, U, V, X, Z. */
export const LETTER_POOL = 'ABCDEFGHIJKLMNOPRSTWY'.split('');

export const SCORING = {
  UNIQUE: 10,
  SHARED: 5,
  INVALID: 0,
  FIRST_FINISHER_BONUS: 5,
  SINGLE_VALID: 10,
  SINGLE_TIME_BONUS_MAX: 10,
};

export const LIMITS = {
  PLAYERS_MIN: 2,
  PLAYERS_MAX: 8,
  ROUNDS_MIN: 5,
  ROUNDS_MAX: 20,
  ROUND_SECONDS: 60,
  ANSWER_MIN: 2,
  ANSWER_MAX: 30,
  CHAT_MAX: 200,
  CHALLENGES_PER_PLAYER: 3,
  REVIEW_SECONDS: 30,
  JUDGE_TIMEOUT_MS: 6000,
  REJOIN_GRACE_SECONDS: 60,
  LETTER_REVEAL_MS: 4000,
  ROUND_RESULT_SECONDS: 10,
  AGE_MIN: 13,
  REPORT_REASONS: ['harassment', 'hate', 'sexual', 'spam', 'cheating', 'other'],
};

export const SINGLE_ROUND_OPTIONS = [5, 10, 15, 20];
