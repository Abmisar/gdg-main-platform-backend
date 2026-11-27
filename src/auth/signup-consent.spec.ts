import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SignupConsentSubmission } from './signup-consent.dto.js';
import { captureConsent, documentVersions } from '../data-rights/consent.js';
import type { Request } from 'express';

it('requires explicit adult confirmation and captures versioned evidence', () => {
  const consent = { ...documentVersions, locale: 'en' };
  for (const value of [undefined, false, 'true', true]) {
    const dto = plainToInstance(SignupConsentSubmission, { consent, ageConfirmed: value });
    expect(validateSync(dto).length === 0).toBe(value === true);
  }
  vi.stubEnv('BETTER_AUTH_SECRET', 'synthetic-secret');
  try {
    const rows = captureConsent(consent, { headers: {}, ip: '192.0.2.1' } as Request, ['signup'], true);
    expect(rows.at(-1)).toMatchObject({ purpose: 'age_18_or_older', document: 'terms', version: consent.terms, acceptedAt: rows[0].acceptedAt });
  } finally {
    vi.unstubAllEnvs();
  }
});
