import { Router } from 'express';
import {
  gameIdParamsSchema,
  roundParamsSchema,
  singleCreateSchema,
  singleLeaderboardQuerySchema,
  singleSubmitSchema,
} from '@fastfour/shared';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * @param {{ controller: object, auth: { requireAuth: Function } }} deps
 */
export function singleRoutes({ controller, auth }) {
  const router = Router();
  router.use('/single', auth.requireAuth);
  router.post(
    '/single/games',
    validate({ body: singleCreateSchema }),
    asyncHandler(controller.create),
  );
  router.post(
    '/single/games/:id/rounds/next',
    validate({ params: gameIdParamsSchema }),
    asyncHandler(controller.next),
  );
  router.post(
    '/single/games/:id/rounds/:index/submit',
    validate({ params: roundParamsSchema, body: singleSubmitSchema }),
    asyncHandler(controller.submit),
  );
  router.get(
    '/single/games/:id',
    validate({ params: gameIdParamsSchema }),
    asyncHandler(controller.get),
  );
  router.post(
    '/single/games/:id/quit',
    validate({ params: gameIdParamsSchema }),
    asyncHandler(controller.quit),
  );
  router.get(
    '/leaderboards/single',
    auth.requireAuth,
    validate({ query: singleLeaderboardQuerySchema }),
    asyncHandler(controller.leaderboard),
  );
  return router;
}
