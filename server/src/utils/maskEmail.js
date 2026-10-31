/**
 * Masks an email for logs: a***@gmail.com
 * @param {string} email
 * @returns {string}
 */
export function maskEmail(email) {
  const [name = '', domain = ''] = String(email).split('@');
  return `${name.slice(0, 1)}***@${domain}`;
}
