import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import pinoHttp from 'pino-http';
import { createErrorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { createAuth } from './middleware/auth.js';
import { createApiLimiter, createAuthLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { createAuthController } from './controllers/authController.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { createAuthService } from './services/authService.js';
import { createEmailProvider } from './services/emailService.js';
import { createTokenService } from './services/tokenService.js';
import { metaRoutes } from './routes/meta.js';
import { serveClient } from './static.js';

function socketOrigins(appOrigin) {
  if (!appOrigin) return [];
  const { host, protocol } = new URL(appOrigin);
  return [protocol === 'https:' ? `wss://${host}` : `ws://${host}`];
}

/**
 * Builds the Express app. Nothing here opens a port or a database connection.
 * @param {object} options
 * @param {object} options.env validated configuration from loadEnv
 * @param {import('pino').Logger} options.logger
 * @param {Array<{ name: string, check: Function }>} [options.readinessChecks]
 * @param {string} [options.clientDist] absolute path to client/dist; omitted in development
 * @param {{ limit?: number, windowMs?: number }} [options.apiLimit]
 * @param {{ limit?: number, windowMs?: number }} [options.authLimit]
 * @param {{ send: Function }} [options.emailProvider] defaults to the provider named by EMAIL_PROVIDER
 * @returns {import('express').Express}
 */
export function createApp({
  env,
  logger,
  readinessChecks = [],
  clientDist,
  apiLimit,
  authLimit,
  emailProvider = createEmailProvider({ env, logger }),
}) {
  const app = express();
  app.disable('x-powered-by');
  if (env.isProduction) app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'", ...socketOrigins(env.APP_ORIGIN)],
          manifestSrc: ["'self'"],
          workerSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(env.isProduction ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity: env.isProduction ? { maxAge: 15_552_000 } : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  if (!env.isProduction) {
    app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  }
  app.use(compression());
  app.use(hpp());
  app.use(express.json({ limit: '10kb' }));

  app.use(healthRoutes(readinessChecks));
  app.use('/api', createApiLimiter(apiLimit));
  app.use('/api', healthRoutes(readinessChecks));
  app.use('/api', metaRoutes(env));

  const tokenService = createTokenService(env);
  const authService = createAuthService({ env, tokenService, emailProvider, logger });
  app.use(
    '/api',
    authRoutes({
      controller: createAuthController({ authService, env }),
      auth: createAuth({ tokenService }),
      authLimiter: createAuthLimiter(authLimit),
    }),
  );
  // Later phases register their API routers here, and /.well-known/assetlinks.json (Phase 12)
  // BEFORE the single-page-app fallback below.

  if (clientDist) serveClient(app, clientDist);
  app.use(notFound);
  app.use(createErrorHandler({ logger }));
  return app;
}
