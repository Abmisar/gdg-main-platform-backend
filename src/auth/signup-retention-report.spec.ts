import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SignupRetentionReport } from './signup-retention-report.js';

describe('expired signup reporting', () => {
  const signupVerification = { count: vi.fn() };
  const pendingSignup = { count: vi.fn() };
  const db = { signupVerification, pendingSignup } as unknown as PrismaService;
  const makeReport = (enabled?: string) => new SignupRetentionReport(db, new ConfigService({
    SIGNUP_RETENTION_REPORT_ENABLED: enabled,
  }));

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('skips the aggregate queries by default', async () => {
    vi.stubEnv('SIGNUP_RETENTION_REPORT_ENABLED', undefined);
    await makeReport().reportExpiredSignups();
    expect(signupVerification.count).not.toHaveBeenCalled();
    expect(pendingSignup.count).not.toHaveBeenCalled();
  });

  it('counts both stores at one cutoff and reports only the totals', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    signupVerification.count.mockResolvedValue(5);
    pendingSignup.count.mockResolvedValue(2);
    await makeReport('true').reportExpiredSignups();
    const cutoff = signupVerification.count.mock.calls[0][0];
    expect(cutoff).toEqual({ where: { expiresAt: { lte: expect.any(Date) } } });
    expect(pendingSignup.count).toHaveBeenCalledWith(cutoff);
    expect(log).toHaveBeenCalledWith({ event: 'expired_signup_counts', expiredSignupVerifications: 5, expiredPendingSignups: 2 });
  });

  it('reports a query failure without logging the underlying error', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    signupVerification.count.mockRejectedValue(new Error('database query failed'));
    await makeReport('true').reportExpiredSignups();
    expect(warn).toHaveBeenCalledWith({ event: 'expired_signup_counts_unavailable' });
  });
});
