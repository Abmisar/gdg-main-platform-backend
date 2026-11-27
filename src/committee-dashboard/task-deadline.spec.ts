import { expect, it } from 'vitest';
import { parseRiyadhDateTime } from './riyadh-date-time.js';

it.each(['2026-12-01T00:30', '2026-12-01T00:30+03:00', '2026-11-30T21:30Z'])('parses %s independently of server time', value => {
  expect(parseRiyadhDateTime(value).toISOString()).toBe('2026-11-30T21:30:00.000Z');
});
