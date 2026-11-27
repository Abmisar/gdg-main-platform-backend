import { randomBytes } from 'node:crypto';
import { FieldCipher } from './field-cipher.js';

const key = () => randomBytes(32).toString('base64');
const keys = { first: key(), second: key() };
const env = {
  FIELD_ENCRYPTION_KEYS: JSON.stringify(keys),
  FIELD_ENCRYPTION_ACTIVE_VERSION: 'first',
  FIELD_BLIND_INDEX_KEY: key(),
};
const old = new FieldCipher(env);
const current = new FieldCipher({
  ...env,
  FIELD_ENCRYPTION_ACTIVE_VERSION: 'second',
});

describe('encrypted personal fields', () => {
  it('round-trips nested JSON and uses a fresh IV for each write', () => {
    const data = { answers: ['اختبار', ''], phone: null };
    const encrypted = old.encrypt(
      'MembershipRequest.applicationData',
      17,
      data,
    );
    expect(old.encrypt('MembershipRequest.applicationData', 17, data)).not.toBe(
      encrypted,
    );
    expect(
      current.decrypt('MembershipRequest.applicationData', 17, encrypted),
    ).toEqual(data);
    expect(
      current.encrypt('MembershipRequest.applicationData', 17, data),
    ).toMatch(/^f2\.second\./);
  });
  it('rejects tampered, misplaced and retired ciphertext', () => {
    const value = old.encrypt('Person.bio', 17, '');
    expect(() =>
      current.decrypt('SignupVerification.fullName', 17, value),
    ).toThrow();
    expect(() => current.decrypt('Person.bio', 18, value)).toThrow();
    expect(current.index('Person.phoneNumber', '٠٥٠ ١٢٣ ٤٥٦٧')).toBe(
      current.index('Person.phoneNumber', '۰۰۹۶۶۵۰۱۲۳۴۵۶۷'),
    );
    const changed = value.split('.');
    changed[3] = Buffer.alloc(16).toString('base64url');
    expect(() =>
      current.decrypt('Person.bio', 17, changed.join('.')),
    ).toThrow();
    const retired = new FieldCipher({
      ...env,
      FIELD_ENCRYPTION_KEYS: JSON.stringify({ second: keys.second }),
      FIELD_ENCRYPTION_ACTIVE_VERSION: 'second',
    });
    expect(() => retired.decrypt('Person.bio', 17, value)).toThrow();
  });
  it('normalizes exact lookups consistently across rotation and separates fields', () => {
    const email = 'synthetic@example.test';
    const digest = old.index('Person.emailUniversity', email);
    expect(
      current.index('Person.emailUniversity', ' ' + email.toUpperCase()),
    ).toBe(digest);
    expect(current.index('AuthUser.email', email)).not.toBe(digest);
    expect(current.index('Person.phoneNumber', '+1 (555) 010-0000')).toBe(
      old.index('Person.phoneNumber', '+15550100000'),
    );
  });
  it('requires a configured active key and independent index key', () => {
    expect(
      () => new FieldCipher({ ...env, FIELD_BLIND_INDEX_KEY: keys.second }),
    ).toThrow();
    expect(
      () =>
        new FieldCipher({ ...env, FIELD_ENCRYPTION_ACTIVE_VERSION: 'missing' }),
    ).toThrow();
    expect(
      () => new FieldCipher({ ...env, FIELD_BLIND_INDEX_KEY: 'bad' }),
    ).toThrow();
  });
});
