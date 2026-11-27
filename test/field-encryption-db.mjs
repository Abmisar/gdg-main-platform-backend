import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { FieldCipher } from '../dist/field-encryption/field-cipher.js';
import { encryptedClient } from '../dist/field-encryption/encrypted-client.js';
import { backfill } from '../scripts/backfill-fields.mjs';

const docker = (args, input) =>
  execFileSync('docker', ['--context', 'colima-gdg-field-test', ...args], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
const container = 'gdg-fields-' + randomUUID();
const password = randomBytes(20).toString('hex');
docker([
  'run',
  '--rm',
  '-d',
  '--name',
  container,
  '-e',
  'POSTGRES_PASSWORD=' + password,
  '-p',
  '127.0.0.1::5432',
  'postgres:17',
]);
try {
  for (let attempt = 0; ; attempt++) {
    try {
      docker(['exec', container, 'pg_isready', '-h', '127.0.0.1']);
      break;
    } catch (error) {
      if (attempt >= 90) throw error;
      await setTimeout(500);
    }
  }
  const sql = (input) =>
    docker(
      [
        'exec',
        '-i',
        container,
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
      ],
      input,
    );
  const migrations = readdirSync('prisma/migrations')
    .filter((name) => /^\d/.test(name))
    .sort();
  for (const migration of migrations)
    sql(readFileSync('prisma/migrations/' + migration + '/migration.sql'));
  sql(
    "INSERT INTO person (full_name, phone_number, email_university) VALUES ('Synthetic Member', '+15550101010', 'campus@example.test'); INSERT INTO membership_request(person_id, application_data) SELECT person_id, '{\"answers\":[\"synthetic\"]}'::jsonb FROM person;",
  );
  sql(
    "INSERT INTO manual_rights_request(contact_email,details,resolution,kind,received_at,due_at) VALUES ('rights@example.test','Synthetic request','Synthetic outcome','ACCESS',now(),now())",
  );
  const first = '00000000-0000-4000-8000-000000000001';
  const second = '00000000-0000-4000-8000-000000000002';
  sql(
    `INSERT INTO auth_user(id,name,email,"updatedAt") VALUES ('${first}','Synthetic One','first@example.test',now()), ('${second}','Synthetic Two','second@example.test',now())`,
  );
  const port = docker(['port', container, '5432/tcp']).trim().split(':').at(-1);
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        'postgres://postgres:' + password + '@127.0.0.1:' + port + '/postgres',
    }),
  });
  const key = () => randomBytes(32).toString('base64');
  const cipher = new FieldCipher({
    FIELD_ENCRYPTION_KEYS: JSON.stringify({ one: key() }),
    FIELD_ENCRYPTION_ACTIVE_VERSION: 'one',
    FIELD_BLIND_INDEX_KEY: key(),
  });
  try {
    const contract = readFileSync(
      'prisma/deferred/20261127130000_drop_plaintext/migration.sql',
    );
    assert.throws(() => sql(contract));
    await backfill(db, cipher, 'backfill', 1);
    sql(
      `UPDATE auth_user SET email='replacement@example.test' WHERE id='${second}'; UPDATE auth_user SET email='second@example.test' WHERE id='${first}';`,
    );
    const before = await db.$queryRawUnsafe(
      'SELECT full_name_encrypted FROM person',
    );
    await backfill(db, cipher, 'backfill', 1);
    assert.deepEqual(
      before,
      await db.$queryRawUnsafe('SELECT full_name_encrypted FROM person'),
    );
    assert.match(before[0].full_name_encrypted, /^f2\.one\./);
    await backfill(db, cipher, 'verify', 1);
    sql("UPDATE person SET full_name = 'Synthetic Updated'");
    assert.throws(() => sql(contract));
    await assert.rejects(backfill(db, cipher, 'verify', 1));
    await backfill(db, cipher, 'backfill', 1);
    await backfill(db, cipher, 'verify', 1);
    sql(contract);
    const app = encryptedClient(db, cipher);
    const reassigned = await app.authUser.findUniqueOrThrow({
      where: { email: 'second@example.test' },
    });
    assert.equal(reassigned.id, first);
    const rights = await app.manualRightsRequest.findFirstOrThrow({
      where: { contactEmail: { equals: 'RIGHTS@example.test' } },
    });
    assert.equal(rights.details, 'Synthetic request');
    assert.equal(rights.resolution, 'Synthetic outcome');
    const person = await app.person.findFirstOrThrow({
      where: {
        emailUniversity: {
          equals: ' CAMPUS@example.test ',
          mode: 'insensitive',
        },
      },
      include: { membershipRequest: true },
    });
    assert.equal(person.fullName, 'Synthetic Updated');
    assert.equal(person.emailUniversityIndex, undefined);
    assert.deepEqual(person.membershipRequest.applicationData, {
      answers: ['synthetic'],
    });
    await app.$transaction((tx) =>
      tx.person.update({
        where: { personId: person.personId },
        data: {
          phoneNumber: '+1 (555) 010-1111',
          emailIdentities: {
            create: { email: 'new@example.test', kind: 'PERSONAL' },
          },
        },
      }),
    );
    const updated = await app.person.findFirstOrThrow({
      where: { phoneNumber: '+15550101111' },
      include: { emailIdentities: true },
    });
    assert.equal(updated.emailIdentities[0].email, 'new@example.test');
    assert.equal(updated.phoneNumber, '+1 (555) 010-1111');
    sql(readFileSync('docs/sql/field-access.sql'));
    for (const table of [
      'role_permission',
      'permission',
      'committee_permission',
      'staff_read_audit',
    ])
      assert.throws(() => sql('SET ROLE gdg_app; DELETE FROM ' + table));
    assert.throws(() =>
      sql('SET ROLE gdg_app; SELECT * FROM recent_staff_reads'),
    );
    assert.throws(() =>
      sql('SET ROLE gdg_app; SELECT * FROM staff_read_audit'),
    );
    assert.throws(() =>
      sql('SET ROLE gdg_audit_reader; SELECT * FROM staff_read_audit'),
    );
    sql('SET ROLE gdg_audit_reader; SELECT * FROM recent_staff_reads');
    assert.throws(() => sql('SET ROLE gdg_app; DELETE FROM staff_read_audit;'));
    sql("INSERT INTO staff_read_audit(actor_member_id,action,count,status,read_at) VALUES(1,'retention.synthetic',1,'DISCLOSED',now()-interval '13 months')");
    const expired = "FROM public.retain_audit_logs(now(),";
    assert.equal(sql('SET ROLE gdg_app; SELECT "staffLogs" ' + expired + ' true)').trim().split(/\s+/).includes('1'), true);
    sql('SET ROLE gdg_app; SELECT * ' + expired + ' false)');
    assert.match(sql("SELECT count(*) FROM staff_read_audit WHERE action='retention.synthetic'"), /\b0\b/);

    assert.throws(() =>
      sql('SET ROLE gdg_app; CREATE TABLE public.invalid(id int);'),
    );
    sql(
      "SET ROLE gdg_app; INSERT INTO staff_read_audit(actor_member_id,action,count,status) VALUES(1,'members.list',1,'DISCLOSED');",
    );
  } finally {
    await db.$disconnect();
  }
} finally {
  docker(['rm', '-f', container]);
}
