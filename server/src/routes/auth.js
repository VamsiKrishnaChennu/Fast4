import { Router } from 'express';
import {
  forgotSchema,
  loginSchema,
  profileUpdateSchema,
  resetSchema,
  signupSchema,
} from '@fastfour/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';

/**
 * @param {{ controller: object, auth: { requireAuth: Function }, authLimiter: Function }} deps
 */
export function authRoutes({ controller, auth, authLimiter }) {
  const router = Router();
  router.post(
    '/auth/signup',
    authLimiter,
    validate({ body: signupSchema }),
    asyncHandler(controller.signup),
  );
  router.post(
    '/auth/login',
    authLimiter,
    validate({ body: loginSchema }),
    asyncHandler(controller.login),
  );
  router.post(
    '/auth/forgot',
    authLimiter,
    validate({ body: forgotSchema }),
    asyncHandler(controller.forgot),
  );
  router.post(
    '/auth/reset',
    authLimiter,
    validate({ body: resetSchema }),
    asyncHandler(controller.reset),
  );
  router.post('/auth/refresh', asyncHandler(controller.refresh));
  router.post('/auth/logout', asyncHandler(controller.logout));
  router.get('/auth/me', auth.requireAuth, asyncHandler(controller.me));
  router.patch(
    '/users/me',
    auth.requireAuth,
    validate({ body: profileUpdateSchema }),
    asyncHandler(controller.updateMe),
  );
  return router;
}
