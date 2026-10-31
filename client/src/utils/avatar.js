/**
 * Picks readable text for an avatar background.
 * @param {string} hex colour like #FFC247
 * @returns {string} dark or white text colour
 */
export function avatarTextColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1B2250' : '#FFFFFF';
}
