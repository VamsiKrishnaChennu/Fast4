import { randomUUID } from 'node:crypto';

const VALID = /^[\w-]{1,64}$/;

/** Gives every request an id (taken from x-request-id when it is safe) and echoes it back. */
export function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && VALID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
