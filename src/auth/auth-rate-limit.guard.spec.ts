import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthRateLimitGuard, PersonRateLimitGuard, type AuthRateLimitRule } from './auth-rate-limit.guard.js';

const queryRaw = vi.fn();
const getRules = vi.fn();
const guard = new AuthRateLimitGuard(
  { $queryRaw: queryRaw } as unknown as PrismaService,
  { getOrThrow: () => 'test-secret' } as unknown as ConfigService,
  { get: getRules } as never,
);

const rule: AuthRateLimitRule = {
  scope: 'login',
  dimension: 'email',
  limit: 2,
  windowSeconds: 60,
};

function contextFor(request: Record<string, unknown>) {
  return {
    getHandler: () => 'handler',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

beforeEach(() => {
  queryRaw.mockReset().mockResolvedValue([{ request_count: 1 }]);
  getRules.mockReset().mockReturnValue([rule]);
});

describe('AuthRateLimitGuard', () => {
  it('allows requests below a policy limit', async () => {
    await expect(guard.canActivate(contextFor({
      ip: '127.0.0.1',
      body: { email: 'User@Example.test' },
      headers: {},
    }))).resolves.toBe(true);
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('returns 429 when the atomic database counter exceeds the policy limit', async () => {
    queryRaw.mockResolvedValue([{ request_count: 3 }]);

    const error = await guard.canActivate(contextFor({
      ip: '127.0.0.1',
      body: { email: 'User@Example.test' },
      headers: {},
    })).catch((caught) => caught as HttpException);

    if (!(error instanceof HttpException)) throw new Error('Expected a rate-limit exception.');
    expect(error.getStatus()).toBe(429);
  });

  it('fails closed with 503 when persistent limiter storage is unavailable', async () => {
    queryRaw.mockRejectedValue(new Error('database unavailable'));

    const error = await guard.canActivate(contextFor({
      ip: '127.0.0.1',
      body: { email: 'user@example.test' },
      headers: {},
    })).catch((caught) => caught as HttpException);

    if (!(error instanceof HttpException)) throw new Error('Expected a storage exception.');
    expect(error.getStatus()).toBe(503);
  });

  it('does not create an email bucket when the request has no email value', async () => {
    await expect(guard.canActivate(contextFor({ ip: '127.0.0.1', headers: {}, body: {} })))
      .resolves.toBe(true);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

it('counts IPs before authentication and counts only the authenticated subject in the route guard', async () => {
  const personGuard = new PersonRateLimitGuard(
    { $queryRaw: queryRaw } as unknown as PrismaService,
    { getOrThrow: () => 'synthetic-key' } as unknown as ConfigService,
    { get: getRules } as never,
  );
  getRules.mockReturnValue([
    { scope: 'rights-submit', dimension: 'ip', limit: 50, windowSeconds: 86400 },
    { scope: 'rights-submit', dimension: 'person', limit: 5, windowSeconds: 86400 },
  ]);
  const request = { headers: {}, ip: '192.0.2.1', body: { personId: 99 } };
  await guard.canActivate(contextFor(request));
  await personGuard.canActivate(contextFor(request));
  expect(queryRaw).toHaveBeenCalledTimes(1);
  const authenticated = { ...request, user: { personId: 12 } };
  await personGuard.canActivate(contextFor(authenticated));
  await personGuard.canActivate(contextFor({ ...authenticated, body: { personId: 100 }, ip: '192.0.2.2' }));
  await personGuard.canActivate(contextFor({ ...authenticated, user: { personId: 13 } }));
  const keys = queryRaw.mock.calls.map(call => call[3]);
  expect(keys[1]).toBe(keys[2]);
  expect(keys[1]).not.toBe(keys[3]);
});
