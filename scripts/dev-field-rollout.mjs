import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { FieldCipher } from '../dist/field-encryption/field-cipher.js';
import { backfill } from './backfill-fields.mjs';

const cipher = new FieldCipher(process.env);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  const [state] =
    await db.$queryRaw`SELECT to_regclass('public.field_backfill_verification') IS NOT NULL AS pending`;
  if (state.pending) {
    await backfill(db, cipher, 'backfill');
    await backfill(db, cipher, 'verify');
    execFileSync(
      'pnpm',
      [
        'exec',
        'prisma',
        'db',
        'execute',
        '--file',
        'prisma/deferred/20261127130000_drop_plaintext/migration.sql',
        '--config',
        'prisma7.config.ts',
      ],
      { stdio: 'inherit' },
    );
  }
} finally {
  await db.$disconnect();
}
