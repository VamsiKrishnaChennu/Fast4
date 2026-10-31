const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/**
 * Converts a duration such as 15m or 7d into milliseconds.
 * @param {string} value
 * @returns {number}
 * @throws {Error} when the format is not a number followed by s, m, h or d
 */
export function ttlToMs(value) {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNITS[match[2]];
}
