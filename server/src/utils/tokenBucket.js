/**
 * A token bucket: `capacity` actions at once, refilled evenly so that `capacity` actions are
 * allowed per `windowMs` on average. Pure: the caller passes the time.
 * @param {{ capacity: number, windowMs: number }} options
 */
export function createTokenBucket({ capacity, windowMs }) {
  let tokens = capacity;
  let last = null;
  const perMs = capacity / windowMs;
  return {
    /**
     * @param {number} now milliseconds
     * @returns {boolean} true when the action is allowed (and uses one token)
     */
    take(now) {
      if (last !== null) tokens = Math.min(capacity, tokens + (now - last) * perMs);
      last = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}
