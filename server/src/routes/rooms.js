import { Router } from 'express';
import { roomCodeParamsSchema } from '@fastfour/shared';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Room preview for the join screen.
 * @param {{ roomManager: { preview: Function }, auth: { requireAuth: Function } }} deps
 */
export function roomRoutes({ roomManager, auth }) {
  const router = Router();
  router.get(
    '/rooms/:code',
    auth.requireAuth,
    validate({ params: roomCodeParamsSchema }),
    asyncHandler(async (req, res) => {
      res.json(roomManager.preview(req.params.code));
    }),
  );
  return router;
}
