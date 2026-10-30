import { Router } from 'express';

/**
 * Liveness and readiness routes for the hosting platform.
 * @param {Array<{ name: string, check: () => boolean | Promise<boolean> }>} checks
 */
export function healthRoutes(checks) {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/ready', async (req, res) => {
    const results = {};
    for (const { name, check } of checks) {
      try {
        results[name] = Boolean(await check());
      } catch {
        results[name] = false;
      }
    }
    const ready = Object.values(results).every(Boolean);
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks: results });
  });

  return router;
}
