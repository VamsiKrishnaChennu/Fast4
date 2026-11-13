/**
 * Privacy Policy text. One source for the web page (/privacy) and docs/legal/privacy.md
 * (regenerate with `npm run docs:legal`). Every statement must match what the app really does;
 * change this file whenever data collection changes. A person must review it before launch.
 */
export const LEGAL_UPDATED = '13 November 2026';

export function privacy({ email }) {
  return {
    title: 'Privacy Policy',
    updated: LEGAL_UPDATED,
    blocks: [
      {
        p: [
          'Fast Four is a word game where you write a Name, a Place, an Animal and a Thing that start with a random letter. This policy explains what information the app collects, why, who handles it, and how you can have it deleted.',
          `The app is run by Chennu Vamsi Krishna, an individual in India ("we"). You can reach us at ${email}.`,
        ],
      },
      {
        h: 'Who the app is for',
        p: [
          'Fast Four is for people aged 13 and over. You confirm this when you create an account. We do not knowingly collect information from anyone younger. If you believe a child has made an account, write to us and we will delete it.',
        ],
      },
      {
        h: 'What we collect and why',
        ul: [
          'Account details: your nickname, your email address or phone number (at least one), and a password. The password is stored only as a salted hash, never in readable form. Used to create and secure your account and to send password reset emails.',
          'Avatar colour: the colour you pick for your profile picture. Used to show you to other players.',
          'Your age and terms confirmation: the time you confirmed you are 13 or older and accepted the Terms and Privacy Policy.',
          'Game data: your solo and group games, scores, statistics, the answers you type and the results of challenges and appeals. Used to run the game, show results and leaderboards, and keep your history.',
          'Chat: messages you send in a room, with your nickname and the room code. Messages are deleted after 7 days.',
          'Safety records: reports you send or that are made about you (with a copy of the reported text) and the players you block. Used to keep the community safe.',
          'Technical logs: your IP address, the page or action requested and error details, kept on our server for up to 14 days to keep the service running and secure.',
          'A sign-in cookie: a secure cookie that keeps you logged in. It is not used for tracking.',
        ],
      },
      {
        h: 'What we do not do',
        ul: [
          'No advertising, no analytics or tracking tools, and no sale of your information.',
          'We do not ask for your location, contacts, camera, microphone or any device permission. The Android app asks only for internet access.',
        ],
      },
      {
        h: 'Who handles your information',
        p: ['We use a few companies to run the app. They handle information only on our behalf:'],
        ul: [
          'Our hosting provider runs the app and its servers.',
          'MongoDB Atlas stores the database.',
          'Google (Gmail) sends password reset emails. Only your email address and the reset link are involved.',
          'To check a word that a player challenges, we send only that word (not who wrote it) to Wikidata or the Free Dictionary API. Results are cached.',
        ],
      },
      {
        h: 'How long we keep it',
        ul: [
          'Your account and game history: until you delete your account.',
          'Chat messages: 7 days.',
          'Server logs: up to 14 days.',
          'Database backups: until they expire, at most 30 days. Deleted data may remain in backups until then.',
          'Password reset links: they expire after a short time and can be used once.',
        ],
      },
      {
        h: 'Deleting your account and data',
        p: [
          'You can delete your account at any time in the app (Profile, then Delete account) or on the web at /delete-account, which works without installing the app. We then delete your account, sign-in sessions, chat messages, blocks, reports you sent, and your solo games.',
          'Group games you played stay so other players keep their results and history, but your entry becomes "Deleted player", is no longer linked to you, and the words you typed are removed.',
          `If you cannot log in, email ${email} and we will delete your account after verifying it is yours, within 30 days.`,
        ],
      },
      {
        h: 'Your choices and rights',
        p: [
          `You can change your nickname and avatar colour in Profile. You can ask us for a copy of your information, or to correct it, by emailing ${email}. Depending on where you live you may have further rights under local law; we will respond within 30 days.`,
        ],
      },
      {
        h: 'Security',
        p: [
          'Traffic between the app and our servers uses HTTPS. Passwords are hashed. Access to the database is restricted. No system is perfectly secure, so please use a password you do not use anywhere else.',
        ],
      },
      {
        h: 'Changes to this policy',
        p: [
          'If we change this policy we will update the date above and, for important changes, tell you in the app.',
        ],
      },
      { h: 'Contact', p: [`${email}`] },
    ],
  };
}
