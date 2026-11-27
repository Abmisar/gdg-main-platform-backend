import type { Request } from 'express';
import { captureConsent, documentVersions } from './consent.js';

const request = {
  ip: '192.0.2.1',
  headers: { 'user-agent': 'synthetic-client' },
} as Request;
describe('consent evidence', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects a stale document or unsupported locale', () => {
    for (const consent of [
      { ...documentVersions, terms: 'old', locale: 'en' },
      { ...documentVersions, locale: 'de' },
    ]) {
      expect(() => captureConsent(consent, request, ['signup'])).toThrow(
        'Accept the current',
      );
    }
  });

  it('binds both documents to each purpose at submission time', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'synthetic-consent-key');
    const rows = captureConsent(
      { ...documentVersions, locale: 'ar' },
      request,
      ['signup', 'membership'],
    );
    expect(rows.map((row) => [row.purpose, row.document])).toEqual([
      ['signup', 'privacy'],
      ['signup', 'terms'],
      ['membership', 'privacy'],
      ['membership', 'terms'],
    ]);
    expect(new Set(rows.map((row) => row.acceptedAt)).size).toBe(1);
    expect(rows[0].ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rows)).not.toMatch(/192\.0\.2\.1|synthetic-client/);
  });
});
