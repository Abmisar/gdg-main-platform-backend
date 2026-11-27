import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ReportingService } from '../src/reporting/reporting.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

it.skipIf(!process.env.REPORTING_FIXTURE_URL)(
  'refreshes stable cohort keys and removes erased members immediately',
  async () => {
    process.env.FIELD_ENCRYPTION_ACTIVE_VERSION = 'test';
    process.env.FIELD_ENCRYPTION_KEYS = JSON.stringify({
      test: randomBytes(32).toString('base64'),
    });
    process.env.FIELD_BLIND_INDEX_KEY = randomBytes(32).toString('base64');
    process.env.REPORTING_PSEUDONYM_SALT = randomBytes(32).toString('hex');
    process.env.REPORTING_ENABLED = 'true';
    const db = new PrismaService(
      new ConfigService({ DATABASE_URL: process.env.REPORTING_FIXTURE_URL }),
    );
    const job = new ReportingService(db);
    try {
      await db.$queryRaw`SELECT created_at FROM public.reporting_disposable_fixture`;
      const ids = () =>
        db.$queryRaw<
          { pseudo_id: string }[]
        >`SELECT pseudo_id FROM reporting_private.member_key ORDER BY member_id`;
      await job.refresh();
      const first = await ids();
      expect(first).toHaveLength(5);
      expect(new Set(first.map((row) => row.pseudo_id)).size).toBe(5);
      await job.refresh();
      expect(await ids()).toEqual(first);
      await db.$executeRaw`DELETE FROM public.member WHERE member_id=(SELECT min(member_id) FROM public.member)`;
      expect(await ids()).toHaveLength(4);
    } finally {
      await db.$disconnect();
    }
  },
  30000,
);
