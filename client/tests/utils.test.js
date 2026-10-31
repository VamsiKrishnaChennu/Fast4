import { describe, expect, test } from 'vitest';
import { signupSchema } from '@fastfour/shared';
import { avatarTextColor } from '../src/utils/avatar.js';
import { issuesToFields } from '../src/utils/formErrors.js';
import { passwordStrength } from '../src/utils/passwordStrength.js';

describe('passwordStrength', () => {
  test.each([
    ['', 0, ''],
    ['abc', 1, 'Weak password'],
    ['Test1234', 2, 'Okay password'],
    ['Test1234abcd', 3, 'Good password'],
    ['Test1234!abcd', 4, 'Strong password'],
  ])('%s scores %i', (password, level, label) => {
    expect(passwordStrength(password)).toEqual({ level, label });
  });
});

describe('avatarTextColor', () => {
  test('dark text on light colours and white text on dark ones', () => {
    expect(avatarTextColor('#FFC247')).toBe('#1B2250');
    expect(avatarTextColor('#1B2250')).toBe('#FFFFFF');
    expect(avatarTextColor('#2F66F5')).toBe('#FFFFFF');
  });
});

describe('issuesToFields', () => {
  test('keeps the first message for each field', () => {
    const result = signupSchema.safeParse({ nickname: 'a', password: 'x' });
    const fields = issuesToFields(result.error);
    expect(fields.nickname).toMatch(/at least 3/);
    expect(fields.password).toBeTruthy();
  });
});
