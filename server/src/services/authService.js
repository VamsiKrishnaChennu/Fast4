import bcrypt from 'bcryptjs';
import { Filter } from 'bad-words';
import { AUTH, RESERVED_NICKNAMES } from '@fastfour/shared';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { createResetToken, hashToken } from './tokenService.js';
import { buildResetEmail } from './emailService.js';
import { toPublicUser } from './userService.js';

const profanity = new Filter();
const INVALID_LOGIN = 'Invalid credentials.';
const BAD_RESET_LINK = 'This reset link is invalid or has expired. Ask for a new one.';

/**
 * Account and session logic. Framework free: controllers pass plain values in.
 * @param {{ env: object, tokenService: object, emailProvider: object, logger: import('pino').Logger }} deps
 */
export function createAuthService({ env, tokenService, emailProvider, logger }) {
  const rounds = env.NODE_ENV === 'test' ? 4 : 12;
  const publicOrigin = env.isProduction ? env.APP_ORIGIN : env.CLIENT_ORIGIN;
  // Compared against when the account does not exist so timing does not reveal it.
  const dummyHash = bcrypt.hashSync('not-a-real-password-1', rounds);

  function checkNickname(nickname) {
    const letters = nickname.toLowerCase().replace(/[\s\d_]/g, '');
    if (RESERVED_NICKNAMES.includes(letters)) {
      throw new AppError('VALIDATION_ERROR', 'That nickname is not available.', [
        { field: 'nickname', message: 'Choose a different nickname.' },
      ]);
    }
    if (profanity.isProfane(nickname.replace(/_/g, ' '))) {
      throw new AppError('VALIDATION_ERROR', 'Please choose a friendlier nickname.', [
        { field: 'nickname', message: 'Please choose a friendlier nickname.' },
      ]);
    }
  }

  async function conflictFor({ nicknameLower, email, phone }) {
    const checks = [
      ['nickname', { nicknameLower }],
      ...(email ? [['email', { email }]] : []),
      ...(phone ? [['phone', { phone }]] : []),
    ];
    for (const [field, filter] of checks) {
      if (await User.exists(filter)) return field;
    }
    return null;
  }

  function conflictError(field) {
    const label = { nickname: 'nickname', email: 'email address', phone: 'phone number' }[field];
    return new AppError('CONFLICT', `That ${label} is already in use.`, [
      { field, message: `That ${label} is already in use.` },
    ]);
  }

  async function addSession(userId, refresh) {
    await Session.create({ userId, jti: refresh.jti, expiresAt: refresh.expiresAt });
    const all = await Session.find({ userId }).sort({ createdAt: 1 }).select('_id').lean();
    const extra = all.length - AUTH.MAX_SESSIONS;
    if (extra > 0) {
      await Session.deleteMany({ _id: { $in: all.slice(0, extra).map((x) => x._id) } });
    }
  }

  async function startSession(user) {
    const refresh = tokenService.signRefresh(user);
    await Session.deleteMany({ userId: user._id, expiresAt: { $lt: new Date() } });
    await addSession(user._id, refresh);
    return { accessToken: tokenService.signAccess(user), refreshToken: refresh.token };
  }

  return {
    /**
     * Creates an account and signs it in.
     * @throws {AppError} AGE_REQUIRED, VALIDATION_ERROR (nickname) or CONFLICT
     */
    async signup(input) {
      if (input.ageConfirmed !== true || input.termsAccepted !== true) {
        throw new AppError(
          'AGE_REQUIRED',
          'Please confirm you are 13 or older and accept the Terms.',
        );
      }
      checkNickname(input.nickname);
      const nicknameLower = input.nickname.toLowerCase();
      const taken = await conflictFor({ nicknameLower, email: input.email, phone: input.phone });
      if (taken) throw conflictError(taken);

      const now = new Date();
      const doc = {
        nickname: input.nickname,
        nicknameLower,
        passwordHash: await bcrypt.hash(input.password, rounds),
        ageConfirmedAt: now,
        termsAcceptedAt: now,
        lastLoginAt: now,
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.avatarColor ? { avatarColor: input.avatarColor } : {}),
      };
      let user;
      try {
        user = await User.create(doc);
      } catch (err) {
        if (err?.code === 11000) {
          throw conflictError((await conflictFor(doc)) ?? 'nickname');
        }
        throw err;
      }
      const session = await startSession(user);
      return { user: toPublicUser(user), ...session };
    },

    /**
     * @throws {AppError} UNAUTHENTICATED with a generic message, or ACCOUNT_SUSPENDED
     */
    async login({ identifier, password }) {
      const id = identifier.trim();
      const filter = id.includes('@')
        ? { email: id.toLowerCase() }
        : { phone: id.replace(/[\s\-()]/g, '') };
      const user = await User.findOne(filter).select('+passwordHash +tokenVersion');
      const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
      if (!user || !ok) throw new AppError('UNAUTHENTICATED', INVALID_LOGIN);
      if (user.bannedAt) {
        throw new AppError('ACCOUNT_SUSPENDED', 'This account has been suspended.');
      }
      user.lastLoginAt = new Date();
      await User.updateOne({ _id: user._id }, { lastLoginAt: user.lastLoginAt });
      const session = await startSession(user);
      return { user: toPublicUser(user), ...session };
    },

    /**
     * Rotates the refresh token. The old one stops working immediately.
     * @throws {AppError} UNAUTHENTICATED when the token is unknown, reused or revoked
     */
    async refresh(refreshToken) {
      const reject = () => new AppError('UNAUTHENTICATED', 'Please log in.');
      if (!refreshToken) throw reject();
      const payload = tokenService.verifyRefresh(refreshToken);
      const user = await User.findById(payload.sub).select('+tokenVersion');
      if (!user || (user.tokenVersion ?? 0) !== payload.tv) throw reject();
      if (user.bannedAt)
        throw new AppError('ACCOUNT_SUSPENDED', 'This account has been suspended.');

      // Claim the old session atomically: only one request can delete it, so a reused or
      // simultaneous refresh with the same token fails.
      const claimed = await Session.deleteOne({ userId: user._id, jti: payload.jti });
      if (claimed.deletedCount !== 1) throw reject();
      const next = tokenService.signRefresh(user);
      await addSession(user._id, next);
      return { accessToken: tokenService.signAccess(user), refreshToken: next.token };
    },

    /** Ends the session that owns this refresh token. Never throws for a bad token. */
    async logout(refreshToken) {
      if (!refreshToken) return;
      try {
        const payload = tokenService.verifyRefresh(refreshToken);
        await Session.deleteOne({ userId: payload.sub, jti: payload.jti });
      } catch {
        // An invalid token has no session to end.
      }
    },

    /** @throws {AppError} UNAUTHENTICATED when the account no longer exists */
    async me(userId) {
      const user = await User.findById(userId);
      if (!user) throw new AppError('UNAUTHENTICATED', 'Please log in.');
      return toPublicUser(user);
    },

    /**
     * Starts a password reset. Answers the same whether or not the email has an account.
     * @returns {Promise<{ delivery?: Promise<void> }>} delivery resolves when the email is sent
     */
    async forgot(email) {
      const user = await User.findOne({ email });
      if (!user || user.bannedAt) return {};
      const { token, hash } = createResetToken();
      const expires = new Date(Date.now() + AUTH.RESET_TOKEN_MINUTES * 60_000);
      await User.updateOne(
        { _id: user._id },
        { passwordResetTokenHash: hash, passwordResetExpiresAt: expires },
      );
      const link = `${publicOrigin}/reset-password?token=${encodeURIComponent(token)}`;
      const message = buildResetEmail({ link, minutes: AUTH.RESET_TOKEN_MINUTES });
      const delivery = emailProvider.send({ to: email, ...message }).catch((err) => {
        logger.error({ err: err.message }, 'password reset email failed');
      });
      return { delivery };
    },

    /**
     * Sets a new password from a reset link and signs the account out everywhere.
     * @throws {AppError} VALIDATION_ERROR when the link is invalid, used or expired
     */
    async reset({ token, password }) {
      const user = await User.findOne({ passwordResetTokenHash: hashToken(token) }).select(
        '+passwordResetExpiresAt',
      );
      if (
        !user ||
        !user.passwordResetExpiresAt ||
        user.passwordResetExpiresAt.getTime() < Date.now()
      ) {
        throw new AppError('VALIDATION_ERROR', BAD_RESET_LINK, [
          { field: 'token', message: BAD_RESET_LINK },
        ]);
      }
      await Session.deleteMany({ userId: user._id });
      await User.updateOne(
        { _id: user._id },
        {
          passwordHash: await bcrypt.hash(password, rounds),
          $inc: { tokenVersion: 1 },
          $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
        },
      );
    },
  };
}
