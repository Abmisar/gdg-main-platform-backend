import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipRequestEmailService } from './membership-request-email.service.js';

@Injectable()
export class MembershipDeliveryJob {
  private readonly logger = new Logger(MembershipDeliveryJob.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MembershipRequestEmailService) private readonly emails: MembershipRequestEmailService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    const now = new Date();
    const where = { sentAt: null, availableAt: { lte: now } };
    const recipient = { select: { person: { select: { emailPersonal: true, emailUniversity: true } } } };
    const rows = await this.prisma.membershipDecisionDelivery.findMany({
      where, take: 25, orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
      include: {
        committee: { include: { committee: true, membershipRequest: recipient } },
        global: { include: { role: true, membershipRequest: recipient } },
      },
    });
    for (const row of rows) {
      const attempts = row.attempts + 1;
      const lease = await this.prisma.membershipDecisionDelivery.updateMany({
        where: { ...where, id: row.id, attempts: row.attempts },
        data: { attempts, availableAt: new Date(Date.now() + 300_000) },
      });
      if (!lease.count) continue;
      const owner = { id: row.id, attempts, sentAt: null };
      try {
        const decision = row.committee ?? row.global;
        if (!decision || decision.status === 'PENDING') throw new Error('Missing decision');
        const person = decision.membershipRequest.person;
        const globalRoleName = row.global?.role.description ?? row.global?.roleCode;
        await this.emails.sendDecisionEmail({
          to: person.emailPersonal ?? person.emailUniversity, decision: decision.status,
          committeeName: row.committee?.committee.committeeName, globalRoleName,
          roleName: row.committee?.requestedRole ?? globalRoleName,
        }, true);
        await this.prisma.membershipDecisionDelivery.updateMany({ where: owner, data: { sentAt: new Date() } });
      } catch {
        const delay = 60_000 * 2 ** Math.min(attempts, 10);
        await this.prisma.membershipDecisionDelivery.updateMany({ where: owner, data: { availableAt: new Date(Date.now() + delay) } });
        this.logger.error({ event: 'membership_delivery_retry', id: row.id, attempts });
      }
    }
  }
}
