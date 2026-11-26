import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SignupRetentionReport {
  private readonly logger = new Logger(SignupRetentionReport.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'UTC', waitForCompletion: true })
  async reportExpiredSignups() {
    if (this.config.get<string>('SIGNUP_RETENTION_REPORT_ENABLED') !== 'true') return;
    const where = { expiresAt: { lte: new Date() } };
    try {
      const [expiredSignupVerifications, expiredPendingSignups] = await Promise.all([
        this.prisma.signupVerification.count({ where }),
        this.prisma.pendingSignup.count({ where }),
      ]);
      this.logger.log({ event: 'expired_signup_counts', expiredSignupVerifications, expiredPendingSignups });
    } catch {
      this.logger.warn({ event: 'expired_signup_counts_unavailable' });
    }
  }
}
