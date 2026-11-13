import { Router } from 'express';

/**
 * GET /api/admin/metrics (admin only): rooms, sockets, event-loop lag and memory.
 * @param {{ metrics: { snapshot: Function }, auth: { requireAuth: Function, requireAdmin: Function } }} deps
 */
export function metricsRoutes({ metrics, auth }) {
  const router = Router();
  router.get('/admin/metrics', auth.requireAuth, auth.requireAdmin, (req, res) => {
    res.json(metrics.snapshot());
  });
  return router;
}
