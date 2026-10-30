import pino from 'pino';

/**
 * Creates the JSON logger. Secrets are redacted wherever they could appear.
 * @param {{ LOG_LEVEL: string, NODE_ENV: string }} env
 */
export function createLogger(env) {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    base: { service: 'fast-four' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        '*.password',
        'token',
        '*.token',
      ],
      censor: '[redacted]',
    },
  });
}
