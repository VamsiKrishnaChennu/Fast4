const LABELS = ['', 'Weak password', 'Okay password', 'Good password', 'Strong password'];

/**
 * Scores a password from 0 to 4 for the strength bars.
 * @param {string} password
 * @returns {{ level: number, label: string }}
 */
export function passwordStrength(password) {
  if (!password) return { level: 0, label: '' };
  let level = 0;
  if (password.length >= 8) level += 1;
  if (password.length >= 12) level += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) level += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) level += 1;
  level = Math.max(1, level);
  return { level, label: LABELS[level] };
}
