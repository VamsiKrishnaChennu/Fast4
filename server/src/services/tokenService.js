import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import { ttlToMs } from '../utils/ttl.js';

/**
 * Signs and verifies access and refresh tokens.
 * @param {object} env validated configuration
 */
export function createTokenService(env) {
  return {
    /** @returns {string} 15 minute access token { sub, role, tv } */
    signAccess(user) {
      return jwt.sign(
        { sub: String(user._id), role: user.role, tv: user.tokenVersion ?? 0 },
        env.JWT_ACCESS_SECRET,
        {
          expiresIn: Math.floor(ttlToMs(env.ACCESS_TOKEN_TTL) / 1000),
        },
      );
    },

    /** @returns {{ token: string, jti: string, expiresAt: Date }} refresh token with its session id */
    signRefresh(user) {
      const jti = randomUUID();
      const ttl = ttlToMs(env.REFRESH_TOKEN_TTL);
      const token = jwt.sign(
        { sub: String(user._id), tv: user.tokenVersion ?? 0, jti },
        env.JWT_REFRESH_SECRET,
        {
          expiresIn: Math.floor(ttl / 1000),
        },
      );
      return { token, jti, expiresAt: new Date(Date.now() + ttl) };
    },

    /**
     * @throws {AppError} TOKEN_EXPIRED when expired, UNAUTHENTICATED for anything else
     */
    verifyAccess(token) {
      try {
        return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
      } catch (err) {
        if (err?.name === 'TokenExpiredError') {
          throw new AppError('TOKEN_EXPIRED', 'Your session has expired.');
        }
        throw new AppError('UNAUTHENTICATED', 'Please log in.');
      }
    },

    /** @throws {AppError} UNAUTHENTICATED when the token is invalid or expired */
    verifyRefresh(token) {
      try {
        return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
      } catch {
        throw new AppError('UNAUTHENTICATED', 'Please log in.');
      }
    },
  };
}

/** @returns {{ token: string, hash: string }} a random reset token and the hash that is stored */
export function createResetToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** @returns {string} sha256 hex of a token */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
