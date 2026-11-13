/**
 * Sends unexpected errors to Sentry when SENTRY_DSN is set and the `@sentry/node` package is
 * installed; otherwise it only logs. Nothing here ever throws, so reporting cannot hurt a request.
 * Only error details are sent: the request body, headers and cookies are never attached.
 * @param {{ env: { SENTRY_DSN?: string, NODE_ENV: string, APP_VERSION?: string }, logger: import('pino').Logger, load?: () => Promise<object> }} deps
 *   `load` replaces the Sentry import (tests)
 */
export function createErrorReporter({
  env,
  logger,
  load = () => import(/* @vite-ignore */ '@sentry/node'),
}) {
  let sentry = null;
  const ready = (async () => {
    if (!env.SENTRY_DSN) return;
    try {
      const mod = await load();
      mod.init({
        dsn: env.SENTRY_DSN,
        environment: env.NODE_ENV,
        release: env.APP_VERSION,
        sendDefaultPii: false,
        beforeSend(event) {
          if (event.request) {
            delete event.request.headers;
            delete event.request.cookies;
            delete event.request.data;
          }
          return event;
        },
      });
      sentry = mod;
    } catch (err) {
      logger.warn({ err }, 'SENTRY_DSN is set but @sentry/node could not be loaded; logging only');
    }
  })();

  return {
    /** Resolves when start-up is done (tests and shutdown). */
    ready: () => ready,
    /** @param {unknown} err @param {Record<string, string>} [context] ids only, never personal data */
    capture(err, context = {}) {
      try {
        sentry?.captureException(err, { extra: context });
      } catch (reportErr) {
        logger.warn({ err: reportErr }, 'error report failed');
      }
    },
    /** Waits for queued reports to be sent, at most `ms`. */
    async flush(ms = 2000) {
      await ready;
      try {
        await sentry?.flush(ms);
      } catch {
        // Shutting down anyway.
      }
    },
  };
}
