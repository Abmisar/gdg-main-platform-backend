import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

it('keeps dropped email columns out of runtime raw SQL', () => {
  const invalid = [];
  for (const entry of readdirSync('src', {
    recursive: true,
    withFileTypes: true,
  })) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith('.ts') ||
      entry.name.endsWith('.spec.ts') ||
      entry.parentPath.includes('/generated')
    )
      continue;
    const file = join(entry.parentPath, entry.name);
    const source = readFileSync(file, 'utf8');
    for (const sql of source.matchAll(
      /\$(?:queryRaw|executeRaw)(?:<[^;\x60]*>)?\s*\x60([^\x60]+)\x60/g,
    )) {
      if (/\b(?:email_personal|email_university|contact_email)\b/i.test(sql[1]))
        invalid.push(file);
    }
  }
  expect(invalid).toEqual([]);
});
