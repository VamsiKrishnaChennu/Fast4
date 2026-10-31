import { AppError } from '../utils/AppError.js';
import { parseCookies } from '../utils/cookies.js';
import { ttlToMs } from '../utils/ttl.js';

export const REFRESH_COOKIE = 'ff_refresh';
const COOKIE_PATH = '/api/auth';

/**
 * Thin HTTP layer over the auth service.
 * @param {{ authService: object, env: object }} deps
 */
export function createAuthController({ authService, env }) {
  const cookieOptions = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: COOKIE_PATH,
  };
  const setRefresh = (res, token) =>
    res.cookie(REFRESH_COOKIE, token, { ...cookieOptions, maxAge: ttlToMs(env.REFRESH_TOKEN_TTL) });
  const readRefresh = (req) => parseCookies(req.headers.cookie)[REFRESH_COOKIE];

  return {
    async signup(req, res) {
      const { user, accessToken, refreshToken } = await authService.signup(req.body);
      setRefresh(res, refreshToken);
      res.status(201).json({ user, accessToken });
    },

    async login(req, res) {
      const { user, accessToken, refreshToken } = await authService.login(req.body);
      setRefresh(res, refreshToken);
      res.json({ user, accessToken });
    },

    async refresh(req, res) {
      try {
        const { accessToken, refreshToken } = await authService.refresh(readRefresh(req));
        setRefresh(res, refreshToken);
        res.json({ accessToken });
      } catch (err) {
        if (err instanceof AppError) res.clearCookie(REFRESH_COOKIE, cookieOptions);
        throw err;
      }
    },

    async logout(req, res) {
      await authService.logout(readRefresh(req));
      res.clearCookie(REFRESH_COOKIE, cookieOptions);
      res.status(204).end();
    },

    async me(req, res) {
      res.json({ user: await authService.me(req.auth.userId) });
    },

    async forgot(req, res) {
      await authService.forgot(req.body.email);
      res.status(204).end();
    },

    async reset(req, res) {
      await authService.reset(req.body);
      res.status(204).end();
    },
  };
}
