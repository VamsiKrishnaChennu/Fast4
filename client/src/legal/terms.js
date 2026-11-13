import { LEGAL_UPDATED } from './privacy.js';

/**
 * Terms of Use text. One source for the web page (/terms) and docs/legal/terms.md
 * (regenerate with `npm run docs:legal`). A person must review it before launch.
 */
export function terms({ email }) {
  return {
    title: 'Terms of Use',
    updated: LEGAL_UPDATED,
    blocks: [
      {
        p: [
          `These terms apply when you use Fast Four, run by Chennu Vamsi Krishna in India ("we"). By creating an account or playing you agree to them and to our Privacy Policy. Questions: ${email}.`,
        ],
      },
      {
        h: 'Who can play',
        p: [
          "You must be 13 or older. You are responsible for your account and for keeping your password private. Give accurate sign-up details and do not use another person's email address or phone number.",
        ],
      },
      {
        h: 'Fair play',
        ul: [
          'Play on your own. Do not use scripts, bots, tools or other people to answer for you, and do not exploit bugs. Tell us about bugs instead.',
          'Challenges and appeals are decided by our word checks. Their result is final.',
          'We may remove scores or games that were gained unfairly.',
        ],
      },
      {
        h: 'Community rules',
        p: ['Chat and nicknames are visible to other players. Do not:'],
        ul: [
          'harass, bully, threaten or hate on anyone;',
          'post sexual, violent or illegal content;',
          "share other people's private information;",
          'spam, advertise or impersonate someone;',
          'choose a nickname that breaks these rules.',
        ],
        after: [
          'Use Report on a chat message to tell us about a problem, and Block to stop seeing a player. We review reports.',
        ],
      },
      {
        h: 'What we may do',
        p: [
          'If you break these rules we may mute you from chat, suspend or permanently ban your account, and remove content. We may also end your account if it is inactive for a long time or to follow the law. You can stop at any time by deleting your account (see the Privacy Policy).',
        ],
      },
      {
        h: 'Your content',
        p: [
          'You keep ownership of what you write. You allow us to store and show it to other players as the game needs, for example your nickname, answers and chat messages.',
        ],
      },
      {
        h: 'The service',
        p: [
          'Fast Four is free and provided as is. Games depend on your internet connection, and we may change, pause or stop the service. We do not promise it will always be available or free of errors. Word checks use public sources and can be wrong.',
        ],
      },
      {
        h: 'Liability',
        p: [
          'To the extent the law allows, we are not responsible for losses that come from using the game, including lost scores. Nothing here limits rights you have under the law that cannot be limited.',
        ],
      },
      {
        h: 'Governing law',
        p: ['These terms are governed by the laws of India.'],
      },
      {
        h: 'Changes',
        p: [
          'We may update these terms. The date above shows the latest version. If you keep playing after a change you accept the new terms.',
        ],
      },
      { h: 'Contact', p: [`${email}`] },
    ],
  };
}
