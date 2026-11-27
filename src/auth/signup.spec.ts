import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { signUpEmail } from 'better-auth/api';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { BetterAuthService } from './better-auth.service.js';
import { SignupDto } from './signup.dto.js';

const input: SignupDto = {
  ageConfirmed: true,
  consent: { privacy: '2', terms: '2', locale: 'en' },
  email: 'applicant@example.test', fullName: 'Sample Applicant', password: 'test-password',
  registrationType: 'NON_MEMBER', applicationData: {
    phoneNumber: '0500000000', university: 'University of Jeddah', college: 'Computing',
    major: 'CS', branch: 'Main', skillsByCommittee: { GENERAL: ['Planning'] }, level: '1', gender: 'female',
  },
};

it('requires gender, branch and meaningful skills while allowing a single email', () => {
  expect(validateSync(plainToInstance(SignupDto, input))).toHaveLength(0);
  for (const changes of [{ gender: null }, { branch: ' ' }, { skillsByCommittee: {} }, { skillsByCommittee: { GENERAL: [' '] } }]) {
    const dto = plainToInstance(SignupDto, { ...input, applicationData: { ...input.applicationData, ...changes } });
    expect(validateSync(dto).map(error => error.property)).toContain('applicationData');
  }
});

function fixture() {
  const tx = {
    person: { findFirst: vi.fn().mockResolvedValue(null) },
    signupVerification: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    authUser: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    authAccount: { create: vi.fn() },
  };
  const db = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
  const hash = vi.fn().mockResolvedValue('hashed-credential');
  const sendVerificationEmail = vi.fn().mockResolvedValue({ status: true });
  const auth = {
    $context: Promise.resolve({ password: { config: { minPasswordLength: 8, maxPasswordLength: 128 }, hash } }),
    api: { signUpEmail: signUpEmail(), sendVerificationEmail },
  };
  const service = new AuthService(db as unknown as PrismaService, { auth } as unknown as BetterAuthService);
  return { tx, db, service, hash, sendVerificationEmail };
}

describe('signup staging', () => {
  it.each(['person', 'staged application', 'reserved identity'])('acknowledges a %s without replacing credentials or staging choices', async state => {
    const { tx, service, hash, sendVerificationEmail } = fixture();
    if (state === 'person') tx.person.findFirst.mockResolvedValue({ personId: 1 });
    if (state === 'staged application') tx.signupVerification.findUnique.mockResolvedValue({ signupVerificationId: 1 });
    if (state === 'reserved identity') tx.authUser.createMany.mockResolvedValue({ count: 0 });
    await expect(service.signup(input, [])).resolves.toEqual({ emailVerificationRequired: true });
    expect(hash).toHaveBeenCalledWith(input.password);
    expect(tx.authAccount.create).not.toHaveBeenCalled();
    expect(tx.signupVerification.create).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('honors the auth provider input and password limits before staging', async () => {
    const { db, service, hash } = fixture();
    for (const invalid of [{ email: 'bad-address' }, { password: '🐢'.repeat(70) }]) {
      await expect(service.signup({ ...input, ...invalid }, [])).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(hash).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('requests verification only after successful staging', async () => {
    const { tx, service, sendVerificationEmail } = fixture();
    tx.signupVerification.create.mockRejectedValue(new Error('staging unavailable'));
    await expect(service.signup(input, [])).rejects.toThrow('staging unavailable');
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

it('stores the current pair when an existing Google profile accepts again', async () => {
  const consentRecord = { createMany: vi.fn() };
  const prisma = { consentRecord, person: { findUnique: vi.fn().mockResolvedValue({ personId: 7, pendingSignup: null }) } };
  const service = new AuthService(prisma as unknown as PrismaService, {} as BetterAuthService);
  const evidence = ['terms', 'privacy'].map(document => ({ document, purpose: 'signup', locale: 'ar', version: '2' as const,
    acceptedAt: new Date().toISOString(), ipHash: 'a'.repeat(64), userAgentHash: 'b'.repeat(64) }));
  await service.completeGoogleSignup({ id: 'synthetic-id', email: input.email, emailVerified: true }, input, evidence);
  expect(consentRecord.createMany).toHaveBeenCalledWith({ data: evidence.map(row => ({ ...row, purpose: 'renewal', personId: 7 })) });
});
