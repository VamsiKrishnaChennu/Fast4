import nodemailer from 'nodemailer';
import { maskEmail } from '../utils/maskEmail.js';

/**
 * Email providers share one method: send({ to, subject, text, html }).
 * - console: logs a masked recipient (and the body in development only)
 * - smtp: sends through the configured SMTP server (Gmail with an app password)
 * - memory: keeps messages in `outbox` (tests only)
 */

/** @returns {{ send: Function }} */
export function createConsoleEmailProvider({ env, logger }) {
  return {
    async send({ to, subject, text }) {
      logger.info(
        { to: maskEmail(to), subject, body: env.NODE_ENV === 'development' ? text : undefined },
        'email (console provider)',
      );
    },
  };
}

/** @returns {{ send: Function }} */
export function createSmtpEmailProvider({ env, logger, transport }) {
  const mailer =
    transport ??
    nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 465,
      secure: (env.SMTP_PORT ?? 465) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  return {
    async send({ to, subject, text, html }) {
      await mailer.sendMail({ from: env.EMAIL_FROM, to, subject, text, html });
      logger.info({ to: maskEmail(to), subject }, 'email sent');
    },
  };
}

/** @returns {{ send: Function, outbox: object[] }} */
export function createMemoryEmailProvider() {
  const outbox = [];
  return {
    outbox,
    async send(message) {
      outbox.push(message);
    },
  };
}

/**
 * Picks the provider named by EMAIL_PROVIDER.
 * @param {{ env: object, logger: import('pino').Logger }} deps
 */
export function createEmailProvider(deps) {
  return deps.env.EMAIL_PROVIDER === 'smtp'
    ? createSmtpEmailProvider(deps)
    : createConsoleEmailProvider(deps);
}

/**
 * Builds the password reset message.
 * @param {{ link: string, minutes: number }} options
 */
export function buildResetEmail({ link, minutes }) {
  const text = [
    'Hi,',
    '',
    'Someone asked to reset the password for your Fast Four account.',
    `Open this link within ${minutes} minutes to choose a new password:`,
    link,
    '',
    'If you did not ask for this, you can ignore this email. Your password stays the same.',
    '',
    'Fast Four',
  ].join('\n');
  const html = `<p>Hi,</p><p>Someone asked to reset the password for your Fast Four account.</p><p><a href="${link}">Choose a new password</a> (the link works for ${minutes} minutes).</p><p>If you did not ask for this, you can ignore this email. Your password stays the same.</p><p>Fast Four</p>`;
  return { subject: 'Reset your Fast Four password', text, html };
}
