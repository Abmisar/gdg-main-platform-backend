import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class EventRetentionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async run(cutoff: Date, dryRun: boolean): Promise<number> {
    const eligible = { event: { endsAt: { lte: cutoff } }, OR: [{ walletProjection: { is: null } }, { walletProjection: { is: { active: false, pending: false } } }] };
    const candidates = await this.prisma.eventRegistration.findMany({ where: eligible, select: { registrationId: true }, orderBy: { registrationId: 'asc' }, take: 100 });
    if (dryRun || !candidates.length) return candidates.length;
    return this.prisma.$transaction(async (tx) => {
      const ids = candidates.map(({ registrationId }) => registrationId);
      for (const id of ids) await tx.$queryRaw`SELECT registration_id FROM event_registrations WHERE registration_id = ${id} FOR UPDATE`;
      const rows = await tx.eventRegistration.findMany({ where: { ...eligible, registrationId: { in: ids } }, select: { registrationId: true, eventId: true, checkedInAt: true } });
      const groups = new Map<number, { registered: number; attended: number }>();
      for (const row of rows) {
        const group = groups.get(row.eventId) ?? { registered: 0, attended: 0 };
        group.registered++;
        if (row.checkedInAt) group.attended++;
        groups.set(row.eventId, group);
      }
      for (const [eventId, group] of groups) {
        await tx.eventRetentionAggregate.upsert({ where: { eventId }, create: { eventId, registeredCount: group.registered, attendedCount: group.attended, computedAt: new Date() }, update: { registeredCount: { increment: group.registered }, attendedCount: { increment: group.attended }, computedAt: new Date() } });
      }
      const selected = rows.map(({ registrationId }) => registrationId);
      await tx.registrationBlacklistEntry.deleteMany({ where: { registrationId: { in: selected } } });
      const result = await tx.eventRegistration.deleteMany({ where: { registrationId: { in: selected } } });
      return result.count;
    });
  }
}
