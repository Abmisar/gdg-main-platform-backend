import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '../generated/prisma/client.js';
import { encryptedClient } from './encrypted-client.js';
import { FieldCipher } from './field-cipher.js';

it('transforms nested writes, reads and filters at the Prisma boundary', async () => {
  const key = () => randomBytes(32).toString('base64');
  const cipher = new FieldCipher({
    FIELD_ENCRYPTION_KEYS: JSON.stringify({ one: key() }),
    FIELD_ENCRYPTION_ACTIVE_VERSION: 'one',
    FIELD_BLIND_INDEX_KEY: key(),
  });
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: 'postgres://127.0.0.1:1/unused',
    }),
  });
  const argsSeen: any[] = [];
  const app = encryptedClient(db, cipher).$extends({
    query: {
      $allModels: {
        async $allOperations({ args, operation }) {
          argsSeen.push(args);
          if (operation === 'create')
            return {
              personId: 1,
              fullName: argsSeen[0].data.fullName,
              emailIdentities: [argsSeen[0].data.emailIdentities.create],
            };
          return [];
        },
      },
    },
  });
  try {
    const person = await app.person.create({
      data: {
        personId: 1,
        fullName: 'Synthetic Member',
        emailIdentities: {
          create: {
            personEmailIdentityId: 2,
            email: 'synthetic@example.test',
            kind: 'PERSONAL',
          },
        },
      },
      select: {
        fullName: true,
        emailIdentities: { select: { email: true, kind: true } },
      },
    });
    expect(argsSeen[0].data.emailIdentities.create.email).toMatch(/^f2\.one\./);
    expect(person).toEqual({
      fullName: 'Synthetic Member',
      emailIdentities: [{ email: 'synthetic@example.test', kind: 'PERSONAL' }],
    });
    await app.member.findMany({
      where: {
        person: {
          OR: [
            {
              emailUniversity: {
                equals: ' CAMPUS@example.test ',
                mode: 'insensitive',
              },
            },
          ],
        },
      },
    });
    expect(argsSeen[1].where.person.OR).toEqual([
      {
        emailUniversityIndex: cipher.index(
          'Person.emailUniversity',
          'campus@example.test',
        ),
      },
    ]);
    await expect(
      app.person.findMany({ orderBy: { fullName: 'asc' } }),
    ).rejects.toThrow('orderBy');
    await expect(
      app.member.findMany({ orderBy: { person: { fullName: 'asc' } } }),
    ).rejects.toThrow('orderBy');
    await expect(app.person.findMany({ distinct: ['bio'] })).rejects.toThrow(
      'distinct',
    );
    await expect(app.person.groupBy({ by: ['fullName'] })).rejects.toThrow(
      'by',
    );
    await expect(
      app.person.aggregate({ _min: { fullName: true } }),
    ).rejects.toThrow('_min');
    await expect(
      app.person.updateMany({ data: { bio: 'synthetic' } }),
    ).rejects.toThrow('single primary key');
    await app.person.createMany({
      data: [
        { personId: 31, fullName: 'Test' },
        { personId: 32, fullName: 'Test' },
      ],
    });
    const batch = argsSeen.at(-1).data;
    expect(cipher.decrypt('Person.fullName', 32, batch[1].fullName)).toBe(
      'Test',
    );
    expect(() =>
      cipher.decrypt('Person.fullName', 31, batch[1].fullName),
    ).toThrow();
  } finally {
    await db.$disconnect();
  }
});
