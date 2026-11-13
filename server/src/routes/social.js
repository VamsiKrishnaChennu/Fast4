import { Router } from 'express';
import {
  blockCreateSchema,
  blockParamsSchema,
  groupLeaderboardQuerySchema,
  historyQuerySchema,
  reportActionSchema,
  reportCreateSchema,
  reportListQuerySchema,
  reportParamsSchema,
} from '@fastfour/shared';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Reports, blocks, game history and the group leaderboard, plus the admin report queue.
 * @param {{ moderation: object, blocks: object, social: object, auth: { requireAuth: Function, requireAdmin: Function } }} deps
 */
export function socialRoutes({ moderation, blocks, social, auth }) {
  const router = Router();

  router.post(
    '/reports',
    auth.requireAuth,
    validate({ body: reportCreateSchema }),
    asyncHandler(async (req, res) => {
      res.status(201).json(await moderation.createReport(req.auth.userId, req.body));
    }),
  );

  router.get(
    '/blocks',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ blocks: await blocks.list(req.auth.userId) });
    }),
  );
  router.post(
    '/blocks',
    auth.requireAuth,
    validate({ body: blockCreateSchema }),
    asyncHandler(async (req, res) => {
      await blocks.add(req.auth.userId, req.body.userId);
      res.status(201).json({ blocks: await blocks.list(req.auth.userId) });
    }),
  );
  router.delete(
    '/blocks/:userId',
    auth.requireAuth,
    validate({ params: blockParamsSchema }),
    asyncHandler(async (req, res) => {
      await blocks.remove(req.auth.userId, req.params.userId);
      res.status(204).end();
    }),
  );

  router.get(
    '/users/me/games',
    auth.requireAuth,
    validate({ query: historyQuerySchema }),
    asyncHandler(async (req, res) => {
      res.json(await social.history(req.auth.userId, req.query));
    }),
  );
  router.get(
    '/leaderboards/group',
    auth.requireAuth,
    validate({ query: groupLeaderboardQuerySchema }),
    asyncHandler(async (req, res) => {
      res.json(await social.groupLeaderboard({ ...req.query, userId: req.auth.userId }));
    }),
  );

  router.get(
    '/admin/reports',
    auth.requireAuth,
    auth.requireAdmin,
    validate({ query: reportListQuerySchema }),
    asyncHandler(async (req, res) => {
      res.json({ reports: await moderation.list(req.query.status) });
    }),
  );
  router.post(
    '/admin/reports/:id/action',
    auth.requireAuth,
    auth.requireAdmin,
    validate({ params: reportParamsSchema, body: reportActionSchema }),
    asyncHandler(async (req, res) => {
      res.json(await moderation.act(req.params.id, req.auth.userId, req.body));
    }),
  );
  return router;
}
