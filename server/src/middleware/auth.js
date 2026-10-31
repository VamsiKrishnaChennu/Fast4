import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

/**
 * Builds the authentication middleware.
 * @param {{ tokenService: ReturnType<import('../services/tokenService.js').createTokenService> }} deps
 */
export function createAuth({ tokenService }) {
  /** Requires a valid Bearer access token. Sets req.auth = { userId, role }. */
  async function requireAuth(req, res, next) {
    try {
      const header = req.headers.authorization ?? '';
      if (!header.startsWith('Bearer ')) throw new AppError('UNAUTHENTICATED', 'Please log in.');
      const payload = tokenService.verifyAccess(header.slice(7));
      const user = await User.findById(payload.sub).select('+tokenVersion role bannedAt').lean();
      if (!user || (user.tokenVersion ?? 0) !== payload.tv) {
        throw new AppError('UNAUTHENTICATED', 'Please log in.');
      }
      if (user.bannedAt)
        throw new AppError('ACCOUNT_SUSPENDED', 'This account has been suspended.');
      req.auth = { userId: String(user._id), role: user.role };
      next();
    } catch (err) {
      next(err);
    }
  }

  /** Use after requireAuth. */
  function requireAdmin(req, res, next) {
    if (req.auth?.role !== 'admin') {
      next(new AppError('FORBIDDEN', 'You do not have access to this.'));
      return;
    }
    next();
  }

  return { requireAuth, requireAdmin };
}
