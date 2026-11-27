import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const config = JSON.parse(
  execFileSync(
    'docker',
    [
      'compose',
      '--env-file',
      '/dev/null',
      '-f',
      'docker-compose.yml',
      '-f',
      'compose.platform.yml',
      'config',
      '--no-interpolate',
      '--format',
      'json',
    ],
    { encoding: 'utf8' },
  ),
);
const { backend, grants, migrate, provision } = config.services;
assert.deepEqual(backend.command, ['sh', '-c', 'exec pnpm start:dev']);
assert.equal(
  backend.depends_on.grants.condition,
  'service_completed_successfully',
);
assert.equal(
  grants.depends_on.migrate.condition,
  'service_completed_successfully',
);
assert.equal(
  migrate.depends_on.provision.condition,
  'service_completed_successfully',
);
assert.deepEqual(migrate.command, [
  'sh',
  '-ec',
  'pnpm prisma:migrate:deploy && node scripts/dev-field-rollout.mjs',
]);
assert.match(migrate.environment.DATABASE_URL, /postgresql:\/\/gdg_migrate:/);
assert.match(backend.environment.DATABASE_URL, /postgresql:\/\/gdg_app:/);
assert.match(
  backend.environment.AUDIT_READER_DATABASE_URL,
  /postgresql:\/\/gdg_audit_reader:/,
);
assert.ok(!('GDG_MIGRATION_PASSWORD' in backend.environment));
