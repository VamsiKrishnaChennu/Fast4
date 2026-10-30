import { Router } from 'express';
import { CATEGORIES, LETTER_POOL, LIMITS, SCORING, SINGLE_ROUND_OPTIONS } from '@fastfour/shared';

/**
 * Public configuration the client reads at startup.
 * @param {{ APP_VERSION: string, SUPPORT_EMAIL?: string, ROUND_SECONDS: number }} env
 */
export function metaRoutes(env) {
  const router = Router();

  router.get('/meta/config', (req, res) => {
    res.json({
      data: {
        appName: 'Fast Four',
        appVersion: env.APP_VERSION,
        supportEmail: env.SUPPORT_EMAIL ?? null,
        categories: CATEGORIES,
        letterPool: LETTER_POOL,
        scoring: SCORING,
        limits: { ...LIMITS, ROUND_SECONDS: env.ROUND_SECONDS },
        singleRoundOptions: SINGLE_ROUND_OPTIONS,
      },
    });
  });

  return router;
}
