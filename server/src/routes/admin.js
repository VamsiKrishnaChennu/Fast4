import { Router } from 'express';
import { z } from 'zod';
import { CATEGORIES } from '@fastfour/shared';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const overturnedQuery = z.object({
  min: z.coerce.number().int().min(1).max(1000).default(3),
});
const entryParams = z.object({
  category: z.enum(CATEGORIES),
  word: z.string().min(1).max(100),
});

/**
 * Admin-only dictionary review. Overturned words are never removed automatically.
 * @param {{ dictionary: { overturned: Function, remove: Function }, auth: { requireAuth: Function, requireAdmin: Function } }} deps
 */
export function adminRoutes({ dictionary, auth }) {
  const router = Router();
  router.use('/admin', auth.requireAuth, auth.requireAdmin);
  router.get(
    '/admin/dictionary/overturned',
    validate({ query: overturnedQuery }),
    asyncHandler(async (req, res) => {
      const entries = await dictionary.overturned(req.query.min);
      res.json({
        entries: entries.map((e) => ({
          category: e.category,
          word: e.word,
          displayWord: e.displayWord ?? e.word,
          source: e.source,
          overturnedCount: e.overturnedCount,
        })),
      });
    }),
  );
  router.delete(
    '/admin/dictionary/:category/:word',
    validate({ params: entryParams }),
    asyncHandler(async (req, res) => {
      await dictionary.remove(req.params.category, req.params.word.toLowerCase());
      res.status(204).end();
    }),
  );
  return router;
}
