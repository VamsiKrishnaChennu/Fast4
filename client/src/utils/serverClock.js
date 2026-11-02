/* Keeps the difference between the server's clock and this device's clock, so countdowns
   follow the server. Every server reply that carries `serverNow` refreshes it. */
let offsetMs = 0;

/** @param {number} serverNow the server's Date.now() when it answered */
export function syncServerTime(serverNow) {
  if (Number.isFinite(serverNow)) offsetMs = serverNow - Date.now();
}

/** @returns {number} the current time on the server's clock, in ms */
export const serverNow = () => Date.now() + offsetMs;

/** @param {number} ms how far the server's clock is ahead of this device's (negative when behind) */
export function setServerOffset(ms) {
  if (Number.isFinite(ms)) offsetMs = ms;
}
