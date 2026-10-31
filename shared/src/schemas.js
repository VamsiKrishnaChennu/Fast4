import { z } from 'zod';
import { AUTH, AVATAR_COLORS } from './constants.js';

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
