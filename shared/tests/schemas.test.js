import {
  forgotSchema,
  loginSchema,
  passwordSchema,
  phoneSchema,
  resetSchema,
  signupSchema,
} from '../index.js';

const base = {
  nickname: 'Maya',
  email: 'Maya@Example.com',
  password: 'Test1234',
  ageConfirmed: true,
  termsAccepted: true,
};

describe('signupSchema', () => {
  test('accepts email or phone and normalizes them', () => {
    expect(signupSchema.parse(base).email).toBe('maya@example.com');
    const withPhone = signupSchema.parse({ ...base, email: undefined, phone: '+1 (415) 555-2671' });
    expect(withPhone.phone).toBe('+14155552671');
  });

  test('requires email or phone', () => {
    expect(signupSchema.safeParse({ ...base, email: undefined }).success).toBe(false);
  });

  test('rejects unknown keys, bad nicknames and operator objects', () => {
    expect(signupSchema.safeParse({ ...base, role: 'admin' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, nickname: 'ab' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, nickname: 'a'.repeat(21) }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, nickname: 'bad<name>' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, email: { $ne: 1 } }).success).toBe(false);
  });

  test('only palette colours are allowed', () => {
    expect(signupSchema.safeParse({ ...base, avatarColor: '#FFC247' }).success).toBe(true);
    expect(signupSchema.safeParse({ ...base, avatarColor: '#000000' }).success).toBe(false);
  });
});

describe('field schemas', () => {
  test('phone must be E.164', () => {
    expect(phoneSchema.safeParse('+14155552671').success).toBe(true);
    for (const bad of ['14155552671', '+0123456789', '12345', '+1415555267112345']) {
      expect(phoneSchema.safeParse(bad).success).toBe(false);
    }
  });

  test('password needs 8 to 72 characters with a letter and a digit', () => {
    expect(passwordSchema.safeParse('Test1234').success).toBe(true);
    for (const bad of ['short1', 'nodigitshere', '12345678', `a1${'x'.repeat(71)}`]) {
      expect(passwordSchema.safeParse(bad).success).toBe(false);
    }
  });

  test('login, forgot and reset are strict', () => {
    expect(loginSchema.safeParse({ identifier: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: 'a@b.co', password: 'x', extra: 1 }).success).toBe(
      false,
    );
    expect(forgotSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(forgotSchema.safeParse({ email: 'nope' }).success).toBe(false);
    expect(resetSchema.safeParse({ token: 'x'.repeat(43), password: 'Test1234' }).success).toBe(
      true,
    );
    expect(resetSchema.safeParse({ token: 'short', password: 'Test1234' }).success).toBe(false);
  });
});
