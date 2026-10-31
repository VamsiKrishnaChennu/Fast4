import { plainClient } from './axiosClient.js';

let cached;

/** Public app settings from the server, fetched once. */
export function getMeta() {
  cached ??= plainClient
    .get('/meta/config')
    .then((res) => res.data.data)
    .catch(() => {
      cached = undefined;
      return null;
    });
  return cached;
}
