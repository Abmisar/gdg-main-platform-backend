import { expect, it, vi } from 'vitest';
import { IncidentAlerts } from './incident-alerts.js';

it.each([
  ['POST', '/api/auth/sign-in/email', 401, 20, 'failedLogin'],
  ['GET', '/data/event-reports/events/:eventId', 200, 5, 'reportRead'],
  ['GET', '/events/:eventId/registrations', 200, 60, 'staffRead'],
] as const)('counts only qualifying %s %s responses within the window', (method, path, status, count, signal) => {
  const notify = vi.fn().mockResolvedValue(undefined);
  const alerts = new IncidentAlerts(notify);
  for (let i = 0; i < count; i++) alerts.observe(method, path, 403, 0);
  alerts.observe(method, path, status, 0);
  for (let i = 1; i < count; i++) alerts.observe(method, path, status, 300000);
  expect(notify).not.toHaveBeenCalled();
  for (let i = 0; i <= count; i++) alerts.observe(method, path, status, 300001);
  expect(notify.mock.calls).toEqual([[signal, count]]);
  for (let i = 0; i < count; i++) alerts.observe(method, path, status, 2100001);
  expect(notify).toHaveBeenCalledTimes(2);
});
