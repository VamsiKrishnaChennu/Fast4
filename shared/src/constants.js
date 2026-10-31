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

export const AUTH = {
  NICKNAME_MIN: 3,
  NICKNAME_MAX: 20,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 72,
  RESET_TOKEN_MINUTES: 30,
  MAX_SESSIONS: 10,
};

/** Avatar colours chosen at signup, in the order of the approved design, plus six more. */
export const AVATAR_COLORS = [
  '#FFC247',
  '#2F66F5',
  '#1FA463',
  '#E8473F',
  '#1B2250',
  '#8B5CF6',
  '#EC4899',
  '#F97316',
  '#14B8A6',
  '#4F46E5',
  '#84CC16',
  '#06B6D4',
];

/** Nicknames that cannot be used (compared after removing spaces, digits and underscores). */
export const RESERVED_NICKNAMES = ['admin', 'support', 'moderator', 'staff', 'fastfour', 'system'];
