import { ROOM_CODE } from './constants.js';

/**
 * Builds a room code from a random-integer source.
 * @param {(max: number) => number} randomInt returns an integer in [0, max); use crypto.randomInt
 * @returns {string} for example "K7Q2MX"
 */
export function makeRoomCode(randomInt) {
  let code = '';
  for (let i = 0; i < ROOM_CODE.LENGTH; i += 1) {
    code += ROOM_CODE.ALPHABET[randomInt(ROOM_CODE.ALPHABET.length)];
  }
  return code;
}

/**
 * Cleans what a person typed or pasted: removes spaces and dashes, upper-cases.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeRoomCode(value) {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
}

/**
 * @param {string} code a normalized code
 * @returns {boolean} true when it has the right length and only allowed characters
 */
export function isRoomCodeFormat(code) {
  return code.length === ROOM_CODE.LENGTH && [...code].every((c) => ROOM_CODE.ALPHABET.includes(c));
}
