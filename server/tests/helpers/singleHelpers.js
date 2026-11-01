import request from 'supertest';
import { createTestApp } from './createTestApp.js';
import { fixtureDictionary } from './fixtures.js';

/** A clock the test moves by hand. */
export function createFakeClock(start = Date.UTC(2026, 10, 1, 12, 0, 0)) {
  return {
    t: start,
    now() {
      return this.t;
    },
    advance(ms) {
      this.t += ms;
    },
  };
}

/** Letters come out in this order, so tests know which words to type. */
export function letterSequence(letters) {
  return (used) => letters[used.length % letters.length];
}

/** Full answer sets that are all valid for a letter (fixture dictionary). */
export const ANSWERS = {
  T: { name: 'Tara', place: 'Tokyo', animal: 'Tiger', thing: 'Table' },
  C: { name: 'Chris', place: 'Canada', animal: 'Cat', thing: 'Cup' },
  S: { name: 'Sam', place: 'Spain', animal: 'Seal', thing: 'Sofa' },
  A: { name: 'Alex', place: 'Albania', animal: 'Ant', thing: 'Apple' },
  B: { name: 'Ben', place: '', animal: 'Bear', thing: 'Bus' },
};

export function createSingleApp({
  clock = createFakeClock(),
  letters = ['T', 'C', 'S', 'A', 'B'],
  envSource,
} = {}) {
  const app = createTestApp({
    dictionary: fixtureDictionary(),
    clock,
    pickLetter: letterSequence(letters),
    envSource,
  });
  return { app, clock };
}

export async function signUp(app, nickname = 'Maya') {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({
      nickname,
      email: `${nickname.toLowerCase()}@example.com`,
      password: 'Test1234',
      ageConfirmed: true,
      termsAccepted: true,
    });
  return { token: res.body.accessToken, user: res.body.user };
}

export const authed = (app, token) => ({
  post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`),
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
});

/**
 * Plays a whole game. `secondsPerRound` is how long after writing started each Done is pressed.
 * Returns the last submit response.
 */
export async function playGame({
  app,
  clock,
  token,
  rounds = 5,
  secondsPerRound = 30,
  answers = ANSWERS,
}) {
  const api = authed(app, token);
  const { body: game } = await api.post('/api/single/games').send({ rounds });
  let last;
  for (let i = 0; i < rounds; i += 1) {
    const { body: round } = await api.post(`/api/single/games/${game.gameId}/rounds/next`);
    clock.t = new Date(round.startedAt).getTime() + secondsPerRound * 1000;
    last = await api
      .post(`/api/single/games/${game.gameId}/rounds/${round.index}/submit`)
      .send({ answers: answers[round.letter] });
  }
  return { gameId: game.gameId, last };
}
