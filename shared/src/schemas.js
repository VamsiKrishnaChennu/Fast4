import { z } from 'zod';
import {
  AUTH,
  AVATAR_COLORS,
  CATEGORIES,
  LIMITS,
  ROOM_DEFAULTS,
  SINGLE_ROUND_OPTIONS,
} from './constants.js';

export const nicknameSchema = z
  .string()
  .trim()
  .min(AUTH.NICKNAME_MIN, `Use at least ${AUTH.NICKNAME_MIN} characters.`)
  .max(AUTH.NICKNAME_MAX, `Use at most ${AUTH.NICKNAME_MAX} characters.`)
  .regex(/^[A-Za-z0-9_ ]+$/, 'Use letters, numbers, spaces and underscores only.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address.'));

/** E.164 phone number, for example +14155552671. Spaces, dashes and brackets are removed first. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/, 'Enter a phone number like +14155552671.'));

export const passwordSchema = z
  .string()
  .min(AUTH.PASSWORD_MIN, `Use at least ${AUTH.PASSWORD_MIN} characters.`)
  .max(AUTH.PASSWORD_MAX, `Use at most ${AUTH.PASSWORD_MAX} characters.`)
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/\d/, 'Include at least one number.');

export const signupSchema = z
  .object({
    nickname: nicknameSchema,
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: passwordSchema,
    avatarColor: z.enum(AVATAR_COLORS).optional(),
    ageConfirmed: z.boolean(),
    termsAccepted: z.boolean(),
  })
  .strict()
  .refine((v) => v.email || v.phone, {
    path: ['email'],
    message: 'Enter an email address or a phone number.',
  });

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(1, 'Enter your email or phone number.').max(254),
    password: z.string().min(1, 'Enter your password.').max(AUTH.PASSWORD_MAX),
  })
  .strict();

export const forgotSchema = z.object({ email: emailSchema }).strict();

export const resetSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: passwordSchema,
  })
  .strict();

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Not a valid id.');

export const gameIdParamsSchema = z.object({ id: objectId }).strict();

export const roundParamsSchema = z
  .object({ id: objectId, index: z.coerce.number().int().min(0).max(99) })
  .strict();

export const singleCreateSchema = z
  .object({
    rounds: z
      .number()
      .int()
      .refine((n) => SINGLE_ROUND_OPTIONS.includes(n), {
        message: `Choose ${SINGLE_ROUND_OPTIONS.join(', ')} rounds.`,
      }),
  })
  .strict();

export const singleSubmitSchema = z
  .object({
    answers: z
      .object(Object.fromEntries(CATEGORIES.map((c) => [c, z.string().max(100).default('')])))
      .strict(),
  })
  .strict();

export const LEADERBOARD_PERIODS = ['daily', 'weekly', 'all'];

export const singleLeaderboardQuerySchema = z
  .object({
    period: z.enum(LEADERBOARD_PERIODS).default('all'),
    rounds: z.coerce
      .number()
      .int()
      .refine((n) => SINGLE_ROUND_OPTIONS.includes(n), {
        message: 'Choose 5, 10, 15 or 20 rounds.',
      })
      .default(10),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const roomSettingsSchema = z
  .object({
    maxPlayers: z.number().int().min(LIMITS.PLAYERS_MIN).max(LIMITS.PLAYERS_MAX),
    rounds: z.number().int().min(LIMITS.ROUNDS_MIN).max(LIMITS.ROUNDS_MAX),
  })
  .strict();

/** room:create. Missing settings use the defaults. */
export const roomCreateSchema = z.preprocess(
  (value) => value ?? {},
  z.object({ settings: roomSettingsSchema.default({ ...ROOM_DEFAULTS }) }).strict(),
);

export const roomJoinSchema = z.object({ code: z.string().trim().max(20) }).strict();

export const roomUpdateSettingsSchema = z.object({ settings: roomSettingsSchema }).strict();

export const roomKickSchema = z.object({ userId: objectId }).strict();

/** Events that carry no data. Anything but an empty object (or nothing) is rejected. */
export const emptyPayloadSchema = z.object({}).strict().default({});

export const roomCodeParamsSchema = z.object({ code: z.string().trim().max(20) }).strict();
