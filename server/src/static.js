import path from 'node:path';
import express from 'express';

const SKIP_PREFIXES = ['/api', '/socket.io', '/.well-known'];

/**
 * Serves the built React app and falls back to index.html for app routes.
 * Fingerprinted assets are cached for a year; index.html and the service worker never are.
 * @param {import('express').Express} app
 * @param {string} distDir absolute path to client/dist
 */
export function serveClient(app, distDir) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader(
          'Cache-Control',
          immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );

  app.get('*', (req, res, next) => {
    const isApi = SKIP_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`));
    if (isApi || path.extname(req.path)) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}
