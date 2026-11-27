import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { erasePerson } from '../data-rights/rights.service.js';
import { EventRetentionService } from './event-retention.service.js';
import { retentionPolicy, subtractDays, subtractMonths } from './retention-policy.js';

const BATCH_SIZE = 100;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(EventRetentionService) private readonly events: EventRetentionService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'UTC', waitForCompletion: true })
  async runScheduled() {
    if (process.env.RETENTION_ENABLED !== 'true') return;
    try {
      const counts = await this.run(new Date(), process.env.RETENTION_DRY_RUN !== 'false');
      const registrations = await this.events.run(subtractMonths(new Date(), retentionPolicy().eventRegistrationMonths), process.env.RETENTION_DRY_RUN !== 'false');
      this.logger.log({ event: 'retention_summary', ...counts, registrations });
    } catch {
      this.logger.warn({ event: 'retention_failed' });
    }
  }

  async run(now: Date, dryRun: boolean) {
    const policy = retentionPolicy();
    const cutoff = subtractMonths(now, policy.authLogMonths);
    const applicationCutoff = subtractMonths(now, policy.applicationMonths);
    const deliveryCutoff = subtractDays(now, policy.emailDeliveryDays);
    const applications = await this.prisma.membershipRequest.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED'] }, updatedAt: { lte: applicationCutoff } },
      select: { membershipRequestId: true }, orderBy: { membershipRequestId: 'asc' }, take: BATCH_SIZE,
    });
    const sessions = await this.prisma.authSession.findMany({ where: { createdAt: { lte: cutoff }, expiresAt: { lte: now } }, select: { id: true }, orderBy: { id: 'asc' }, take: BATCH_SIZE });
    const buckets = await this.prisma.authRateLimitBucket.findMany({ where: { updatedAt: { lte: cutoff } }, select: { bucketHash: true }, orderBy: { bucketHash: 'asc' }, take: BATCH_SIZE });
    const limits = await this.prisma.betterAuthRateLimit.findMany({ where: { lastRequest: { lte: BigInt(cutoff.getTime()) } }, select: { id: true }, orderBy: { id: 'asc' }, take: BATCH_SIZE });
    const deliveries = await this.prisma.registrationEmailDelivery.findMany({ where: { createdAt: { lte: deliveryCutoff }, state: { in: ['SENT', 'FAILED', 'SKIPPED'] } }, select: { id: true }, orderBy: { id: 'asc' }, take: BATCH_SIZE });
    const accountCutoff = subtractMonths(now, policy.inactiveAccountMonths);
    const accounts = await this.prisma.authUser.findMany({
      where: { lastSignInAt: { lte: accountCutoff } },
      select: { id: true }, orderBy: { lastSignInAt: 'asc' }, take: BATCH_SIZE,
    });
    const [audit] = await this.prisma.$queryRaw<{ staffLogs: number; rightsLogs: number }[]>`SELECT * FROM public.retain_audit_logs(${cutoff}, ${dryRun})`;
    if (dryRun) return { accounts: accounts.length, ...audit, applications: applications.length, sessions: sessions.length, buckets: buckets.length, limits: limits.length, deliveries: deliveries.length };
    let removedAccounts = 0;
    for (const { id } of accounts) {
      try {
        const removed = await this.prisma.$transaction(async tx => {
          const eligible = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM auth_user WHERE id = ${id}::uuid AND last_sign_in_at <= ${accountCutoff} FOR UPDATE`;
          if (!eligible.length) return false;
          const person = await tx.person.findUnique({ where: { authUserId: id }, select: { personId: true } });
          if (person) await erasePerson(tx, person.personId);
          else await tx.authUser.delete({ where: { id } });
          return true;
        });
        if (removed) removedAccounts++;
      } catch {
        this.logger.warn({ event: 'inactive_account_erasure_deferred' });
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const ids = applications.map((item) => item.membershipRequestId);
      for (const id of ids) await tx.$queryRaw`SELECT membership_request_id FROM membership_request WHERE membership_request_id = ${id} FOR UPDATE`;
      const eligible = await tx.membershipRequest.findMany({ where: { membershipRequestId: { in: ids }, status: { in: ['APPROVED', 'REJECTED'] }, updatedAt: { lte: applicationCutoff } }, select: { membershipRequestId: true } });
      const eligibleIds = eligible.map((item) => item.membershipRequestId);
      await tx.membershipRequestCommittee.deleteMany({ where: { membershipRequestId: { in: eligibleIds } } });
      await tx.membershipRequestGlobalRole.deleteMany({ where: { membershipRequestId: { in: eligibleIds } } });
      const removedApplications = await tx.membershipRequest.deleteMany({ where: { membershipRequestId: { in: eligibleIds }, status: { in: ['APPROVED', 'REJECTED'] }, updatedAt: { lte: applicationCutoff } } });
      const removedSessions = await tx.authSession.deleteMany({ where: { id: { in: sessions.map((item) => item.id) }, createdAt: { lte: cutoff }, expiresAt: { lte: now } } });
      const removedBuckets = await tx.authRateLimitBucket.deleteMany({ where: { bucketHash: { in: buckets.map((item) => item.bucketHash) }, updatedAt: { lte: cutoff } } });
      const removedLimits = await tx.betterAuthRateLimit.deleteMany({ where: { id: { in: limits.map((item) => item.id) }, lastRequest: { lte: BigInt(cutoff.getTime()) } } });
      const removedDeliveries = await tx.registrationEmailDelivery.deleteMany({ where: { id: { in: deliveries.map((item) => item.id) }, createdAt: { lte: deliveryCutoff }, state: { in: ['SENT', 'FAILED', 'SKIPPED'] } } });
      return { accounts: removedAccounts, ...audit, applications: removedApplications.count, sessions: removedSessions.count, buckets: removedBuckets.count, limits: removedLimits.count, deliveries: removedDeliveries.count };
    });
  }
}
