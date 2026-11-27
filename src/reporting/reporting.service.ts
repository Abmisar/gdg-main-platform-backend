import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

const hijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC',
});

@Injectable()
export class ReportingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Cron('0 2 * * *', { timeZone: 'Asia/Riyadh', waitForCompletion: true })
  async refresh() {
    if (process.env.REPORTING_ENABLED !== 'true') return;
    const salt = process.env.REPORTING_PSEUDONYM_SALT;
    if (!salt || !/^[a-f0-9]{64}$/i.test(salt))
      throw new Error('Invalid reporting salt');
    const keyFor = (id: number) =>
      createHmac('sha256', Buffer.from(salt, 'hex'))
        .update(String(id))
        .digest('hex');
    await this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<
          { acquired: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(3472189) AS acquired`;
        if (!lock.acquired) return;
        const [existing] = await tx.$queryRaw<
          { member_id: number; pseudo_id: string }[]
        >`SELECT member_id, pseudo_id
        FROM reporting_private.member_key ORDER BY member_id LIMIT 1`;
        if (existing && existing.pseudo_id !== keyFor(existing.member_id))
          throw new Error('Reporting salt changed');
        const days = await tx.$queryRaw<{ day: string }[]>`
        SELECT d::date::text AS day FROM generate_series(date '2000-01-01',
          ((now() AT TIME ZONE 'Asia/Riyadh')::date + interval '2 years')::timestamp, interval '1 day') d
        WHERE NOT EXISTS (SELECT FROM reporting_private.calendar c WHERE c.day=d::date)`;
        if (days.length) {
          const calendar = days.map(({ day }) => ({
            day,
            hijri: hijri.format(new Date(day + 'T12:00:00Z')),
          }));
          await tx.$executeRaw`INSERT INTO reporting_private.calendar
          SELECT * FROM jsonb_to_recordset(${JSON.stringify(calendar)}::jsonb) AS c(day date,hijri text)`;
        }
        const members = await tx.$queryRaw<{ member_id: number }[]>`
        SELECT m.member_id FROM public.member m LEFT JOIN reporting_private.member_key k USING (member_id)
        WHERE k.member_id IS NULL ORDER BY m.member_id FOR KEY SHARE OF m`;
        if (members.length) {
          const keys = members.map(({ member_id }) => ({
            member_id,
            pseudo_id: keyFor(member_id),
          }));
          await tx.$executeRaw`INSERT INTO reporting_private.member_key
          SELECT * FROM jsonb_to_recordset(${JSON.stringify(keys)}::jsonb) AS k(member_id int,pseudo_id text)`;
        }
        await tx.$executeRaw`SELECT reporting_private.refresh_roster((now() AT TIME ZONE 'Asia/Riyadh')::date)`;
      },
      { isolationLevel: 'RepeatableRead', timeout: 120000 },
    );
    new Logger(ReportingService.name).log('Reporting refresh finished');
  }
}
