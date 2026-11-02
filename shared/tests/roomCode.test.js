import { randomInt } from 'node:crypto';
import { ROOM_CODE } from '../src/constants.js';
import { isRoomCodeFormat, makeRoomCode, normalizeRoomCode } from '../src/roomCode.js';

describe('room codes', () => {
  test('are 6 characters from the allowed alphabet, with no ambiguous characters', () => {
    for (let i = 0; i < 2000; i += 1) {
      const code = makeRoomCode(randomInt);
      expect(code).toHaveLength(6);
      expect(isRoomCodeFormat(code)).toBe(true);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  test('the alphabet has no 0, O, 1 or I and no repeats', () => {
    expect(ROOM_CODE.ALPHABET).toHaveLength(32);
    expect(new Set(ROOM_CODE.ALPHABET).size).toBe(32);
    for (const c of '01OI') expect(ROOM_CODE.ALPHABET).not.toContain(c);
  });

  test('uses the random source it is given', () => {
    expect(makeRoomCode(() => 0)).toBe('AAAAAA');
    expect(makeRoomCode((max) => max - 1)).toBe('999999'.replace(/9/g, '9'));
  });

  test('normalizes pasted text', () => {
    expect(normalizeRoomCode(' k7q-2mx ')).toBe('K7Q2MX');
    expect(normalizeRoomCode('k7 q2 mx')).toBe('K7Q2MX');
    expect(normalizeRoomCode(null)).toBe('');
    expect(normalizeRoomCode(12)).toBe('');
  });

  test('format check rejects wrong lengths and forbidden characters', () => {
    expect(isRoomCodeFormat('K7Q2MX')).toBe(true);
    expect(isRoomCodeFormat('K7Q2M')).toBe(false);
    expect(isRoomCodeFormat('K7Q2MXX')).toBe(false);
    expect(isRoomCodeFormat('K7Q2M0')).toBe(false);
    expect(isRoomCodeFormat('')).toBe(false);
  });
});
