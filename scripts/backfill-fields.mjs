import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { FieldCipher } from '../dist/field-encryption/field-cipher.js';
import { storage } from '../dist/field-encryption/fields.js';

const quote = (name) => '"' + name + '"';

export async function backfill(db, cipher, mode, batchSize = 100) {
  if (!['backfill', 'verify', 'rotate'].includes(mode))
    throw new Error('Choose backfill, verify or rotate');
  if (mode === 'verify') {
    await db.$transaction(
      async (tx) => {
        const tables = Object.values(storage)
          .map(({ table }) => quote(table))
          .join(', ');
        await tx.$executeRawUnsafe('LOCK TABLE ' + tables + ' IN SHARE MODE');
        await scan(cipher, mode, batchSize, (work) => work(tx));
        await tx.$executeRawUnsafe(
          'INSERT INTO field_backfill_verification VALUES (true) ON CONFLICT DO NOTHING',
        );
      },
      { timeout: 3600000 },
    );
    return;
  }
  await scan(cipher, mode, batchSize, (work) =>
    db.$transaction(work, { timeout: 60000 }),
  );
}

async function scan(cipher, mode, batchSize, transaction) {
  for (const [model, { table, pk, fields }] of Object.entries(storage)) {
    const idType = [
      'AuthSession',
      'AuthUser',
      'AuthAccount',
      'AuthVerification',
      'BetterAuthRateLimit',
    ].includes(model)
      ? 'uuid'
      : 'int';
    let cursor = null;
    const columns = [pk];
    for (const { column, index, json } of Object.values(fields)) {
      columns.push(quote(column + '_encrypted'));
      if (mode !== 'rotate') {
        columns.push(quote(column));
        if (json) columns.push(column + ' IS NULL AS ' + column + '_absent');
      }
      if (index) columns.push(quote(column + '_idx'));
    }
    for (;;) {
      const last = await transaction(async (tx) => {
        const rows = await tx.$queryRawUnsafe(
          'SELECT ' +
            columns.join(', ') +
            ' FROM ' +
            table +
            ' WHERE ($1::' +
            idType +
            ' IS NULL OR ' +
            pk +
            ' > $1) ORDER BY ' +
            pk +
            ' LIMIT $2' +
            (mode === 'verify' ? '' : ' FOR UPDATE'),
          cursor,
          batchSize,
        );
        for (const row of rows) {
          const assignments = [];
          const values = [];
          function assign(column, value, cast = '') {
            values.push(value);
            assignments.push(quote(column) + ' = $' + values.length + cast);
          }
          for (const [name, { column, index, json }] of Object.entries(
            fields,
          )) {
            const field = model + '.' + name;
            const encrypted = row[column + '_encrypted'];
            const decoded =
              encrypted === null
                ? null
                : cipher.decrypt(field, row[pk], encrypted);
            const plain = mode === 'rotate' ? decoded : row[column];
            const absent =
              mode === 'rotate'
                ? encrypted === null
                : json
                  ? row[column + '_absent']
                  : plain === null;
            const digest = index && !absent ? cipher.index(field, plain) : null;
            const matches =
              (encrypted === null) === absent &&
              isDeepStrictEqual(decoded, plain);
            if (mode === 'verify') {
              if (!matches || (index && digest !== row[column + '_idx']))
                throw new Error(
                  'Verification failed for ' + field + ' id ' + row[pk],
                );
              continue;
            }
            if (
              !matches ||
              (mode === 'rotate' && encrypted && !cipher.isCurrent(encrypted))
            ) {
              const envelope = absent
                ? null
                : cipher.encrypt(field, row[pk], plain);
              assign(
                column + '_encrypted',
                json && envelope ? JSON.stringify(envelope) : envelope,
                json ? '::jsonb' : '',
              );
            }
            if (index && digest !== row[column + '_idx'])
              assign(column + '_idx', digest);
          }
          if (values.length) {
            values.push(row[pk]);
            await tx.$executeRawUnsafe(
              'UPDATE ' +
                table +
                ' SET ' +
                assignments.join(', ') +
                ' WHERE ' +
                pk +
                ' = $' +
                values.length +
                '::' +
                idType,
              ...values,
            );
          }
        }
        return rows.at(-1)?.[pk];
      });
      if (last === undefined) break;
      cursor = last;
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await backfill(db, new FieldCipher(process.env), process.argv[2]);
  } finally {
    await db.$disconnect();
  }
}
