import { describe, expect, it } from 'vitest';
import { retentionPolicy, subtractDays, subtractMonths } from './retention-policy.js';

describe('approved retention policy', () => {
  it('uses the approved calendar-month periods', () => {
    expect(retentionPolicy({})).toMatchObject({ applicationMonths: 12, inactiveAccountMonths: 36, authLogMonths: 12, eventRegistrationMonths: 24 });
  });
  it('clamps calendar month subtraction at month end', () => {
    expect(subtractMonths(new Date('2024-08-31T12:00:00Z'), 6).toISOString()).toBe('2024-02-29T12:00:00.000Z');
  });
  it('subtracts complete UTC days', () => {
    expect(subtractDays(new Date('2025-01-01T00:00:00Z'), 90).toISOString()).toBe('2024-10-03T00:00:00.000Z');
  });
  it('accepts positive integer overrides and rejects invalid values', () => {
    expect(retentionPolicy({ RETENTION_AUTH_LOG_MONTHS: '30' }).authLogMonths).toBe(30);
    expect(() => retentionPolicy({ RETENTION_AUTH_LOG_MONTHS: '0' })).toThrow();
  });
});
